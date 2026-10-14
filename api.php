<?php
require __DIR__ . '/db.php';

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($d, int $code = 200) { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $m, int $code = 400) { out(['error' => $m], $code); }

$db = getDB();
$action = $_GET['action'] ?? '';
$in = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Defensa CSRF: un formulario de otro sitio no puede mandar este header.
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'panel') fail('Solicitud inválida', 403);
    $in = json_decode(file_get_contents('php://input'), true) ?: [];
}

function me(PDO $db): ?array {
    if (empty($_SESSION['uid'])) return null;
    $s = $db->prepare('SELECT id, usuario, nombre, rol FROM users WHERE id = ? AND activo = 1');
    $s->execute([$_SESSION['uid']]);
    return $s->fetch() ?: null;
}
function need(PDO $db, bool $admin = false): array {
    $u = me($db);
    if (!$u) fail('Sesión vencida', 401);
    if ($admin && $u['rol'] !== 'admin') fail('Solo administradores', 403);
    return $u;
}
function str($v, int $max): string { return mb_substr(trim((string)$v), 0, $max); }
function cleanUrl(string $u): string {
    // Solo http(s) o rutas relativas: evita javascript: y similares.
    if (!preg_match('#^(https?://[^\s]+|/[^\s]*)$#i', $u)) fail('La dirección debe empezar con https:// o con /');
    return $u;
}
function countAdmins(PDO $db): int { return (int)$db->query("SELECT COUNT(*) FROM users WHERE rol='admin' AND activo=1")->fetchColumn(); }

function seed(PDO $db): void {
    $cats = ['Ventas y catálogos', 'Operaciones', 'Gestión y tiendas'];
    $ids = [];
    foreach ($cats as $i => $n) { $db->prepare('INSERT INTO categorias (nombre, orden) VALUES (?,?)')->execute([$n, $i]); $ids[$i] = (int)$db->lastInsertId(); }
    $apps = [
        [0, 'Preventa', 'Catálogo de preventa con control de stock', 'https://bagsstore.com.ar/preventa/', 'shopping-bag', 'todos'],
        [0, 'Admin Preventa', 'Productos, ingresos y pedidos de preventa', 'https://bagsstore.com.ar/preventa/admin/', 'clipboard-list', 'admin'],
        [0, 'Catálogo Travel Blue', 'Catálogo mayorista Travel Blue', 'https://bagsstore.com.ar/travelblue/', 'package', 'todos'],
        [0, 'Admin Travel Blue', 'Productos, clientes y pedidos', 'https://bagsstore.com.ar/travelblue/admin/', 'clipboard-list', 'admin'],
        [1, 'Devoluciones', 'Devoluciones de mercadería a proveedores', 'https://bagsstore.com.ar/devoluciones/', 'undo-2', 'todos'],
        [1, 'Tareas (Tazkeo)', 'Asignación y seguimiento de tareas del equipo', 'https://tareas.bagsstore.com.ar', 'list-checks', 'todos'],
        [2, 'Odoo', 'ERP y CRM', 'https://odoo.bagsstore.com.ar', 'layout-grid', 'todos'],
        [2, 'Tiendanube', 'Administración de la tienda online', 'https://cindymayorista2.mitiendanube.com/admin', 'store', 'admin'],
    ];
    foreach ($apps as $i => $a) {
        $db->prepare('INSERT INTO apps (nombre, descripcion, url, icono, categoria_id, orden, visibilidad) VALUES (?,?,?,?,?,?,?)')
           ->execute([$a[1], $a[2], $a[3], $a[4], $ids[$a[0]], $i, $a[5]]);
    }
}

try {
switch ($action) {

case 'state': {
    $u = me($db);
    if (!$u) out(['user' => null, 'setup' => (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0]);
    $cats = $db->query('SELECT id, nombre, orden FROM categorias ORDER BY orden, id')->fetchAll();
    $s = $db->prepare("SELECT a.id, a.nombre, a.descripcion, a.url, a.icono, a.categoria_id, a.orden AS orden_global, a.visibilidad, a.owner_id,
            COALESCE(p.favorita,0) AS favorita, COALESCE(p.oculta,0) AS oculta, p.orden, p.orden_fav
        FROM apps a LEFT JOIN prefs p ON p.app_id = a.id AND p.user_id = :u
        WHERE (a.owner_id IS NULL AND (a.visibilidad = 'todos' OR " . ($u['rol'] === 'admin' ? '1' : '0') . ")) OR a.owner_id = :u");
    $s->execute([':u' => $u['id']]);
    out(['user' => $u, 'categorias' => $cats, 'apps' => $s->fetchAll()]);
}

case 'setup': {
    if ((int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) fail('Ya está configurado', 403);
    $usuario = strtolower(str($in['usuario'] ?? '', 40)); $nombre = str($in['nombre'] ?? '', 60); $pass = (string)($in['password'] ?? '');
    if (!preg_match('/^[a-z0-9._-]{3,40}$/', $usuario)) fail('Usuario: 3 a 40 letras, números, punto o guion');
    if ($nombre === '') fail('Falta el nombre');
    if (strlen($pass) < 8) fail('La contraseña debe tener al menos 8 caracteres');
    $db->prepare("INSERT INTO users (usuario, nombre, pass_hash, rol) VALUES (?,?,?, 'admin')")->execute([$usuario, $nombre, password_hash($pass, PASSWORD_DEFAULT)]);
    $adminId = (int)$db->lastInsertId(); // antes de seed(), que inserta más filas
    seed($db);
    session_regenerate_id(true);
    $_SESSION['uid'] = $adminId;
    out(['ok' => true]);
}

case 'login': {
    // Freno simple a fuerza bruta: 8 fallos por sesión -> 60 s de espera.
    if (($_SESSION['fails'] ?? 0) >= 8 && time() - ($_SESSION['fail_t'] ?? 0) < 60) fail('Demasiados intentos. Esperá un minuto.', 429);
    $s = $db->prepare('SELECT * FROM users WHERE usuario = ? AND activo = 1');
    $s->execute([strtolower(str($in['usuario'] ?? '', 40))]);
    $r = $s->fetch();
    if (!$r || !password_verify((string)($in['password'] ?? ''), $r['pass_hash'])) {
        $_SESSION['fails'] = ($_SESSION['fails'] ?? 0) + 1; $_SESSION['fail_t'] = time();
        fail('Usuario o contraseña incorrectos', 401);
    }
    session_regenerate_id(true);
    $_SESSION = ['uid' => (int)$r['id']];
    out(['ok' => true]);
}

case 'logout': { $_SESSION = []; session_destroy(); out(['ok' => true]); }

case 'password': {
    $u = need($db);
    $s = $db->prepare('SELECT pass_hash FROM users WHERE id = ?'); $s->execute([$u['id']]);
    if (!password_verify((string)($in['actual'] ?? ''), $s->fetchColumn())) fail('La contraseña actual no coincide', 401);
    if (strlen((string)($in['nueva'] ?? '')) < 8) fail('La nueva contraseña debe tener al menos 8 caracteres');
    $db->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash($in['nueva'], PASSWORD_DEFAULT), $u['id']]);
    out(['ok' => true]);
}

case 'pref': {
    $u = need($db);
    $id = (int)($in['app_id'] ?? 0);
    $chk = $db->prepare("SELECT 1 FROM apps WHERE id = ? AND (owner_id IS NULL OR owner_id = ?)"); $chk->execute([$id, $u['id']]);
    if (!$chk->fetch()) fail('Herramienta inexistente', 404);
    $db->prepare('INSERT OR IGNORE INTO prefs (user_id, app_id) VALUES (?,?)')->execute([$u['id'], $id]);
    foreach (['favorita', 'oculta'] as $k) {
        if (isset($in[$k])) $db->prepare("UPDATE prefs SET $k = ? WHERE user_id = ? AND app_id = ?")->execute([$in[$k] ? 1 : 0, $u['id'], $id]);
    }
    out(['ok' => true]);
}

case 'reorder': {
    $u = need($db);
    $col = ($in['scope'] ?? '') === 'fav' ? 'orden_fav' : 'orden';
    $ids = array_map('intval', $in['ids'] ?? []);
    $db->beginTransaction();
    foreach ($ids as $i => $id) {
        $db->prepare('INSERT OR IGNORE INTO prefs (user_id, app_id) VALUES (?,?)')->execute([$u['id'], $id]);
        $db->prepare("UPDATE prefs SET $col = ? WHERE user_id = ? AND app_id = ?")->execute([$i, $u['id'], $id]);
    }
    $db->commit();
    out(['ok' => true]);
}

case 'reset_prefs': {
    $u = need($db);
    $db->prepare('DELETE FROM prefs WHERE user_id = ?')->execute([$u['id']]);
    out(['ok' => true]);
}

case 'app_save': {
    $u = need($db);
    $id = (int)($in['id'] ?? 0);
    $personal = !empty($in['personal']);
    if (!$personal && $u['rol'] !== 'admin') fail('Solo administradores', 403);
    $nombre = str($in['nombre'] ?? '', 60);
    if ($nombre === '') fail('Falta el nombre');
    $url = cleanUrl(str($in['url'] ?? '', 500));
    $desc = str($in['descripcion'] ?? '', 140);
    $icono = preg_match('/^[a-z0-9-]{1,30}$/', $in['icono'] ?? '') ? $in['icono'] : 'link';
    $cat = !empty($in['categoria_id']) ? (int)$in['categoria_id'] : null;
    $vis = ($in['visibilidad'] ?? 'todos') === 'admin' ? 'admin' : 'todos';
    if ($id) {
        $s = $db->prepare('SELECT owner_id FROM apps WHERE id = ?'); $s->execute([$id]);
        $row = $s->fetch();
        if (!$row) fail('No existe', 404);
        if ($row['owner_id'] !== null && (int)$row['owner_id'] !== $u['id']) fail('No es tuya', 403);
        if ($row['owner_id'] === null && $u['rol'] !== 'admin') fail('Solo administradores', 403);
        $db->prepare('UPDATE apps SET nombre=?, descripcion=?, url=?, icono=?, categoria_id=?, visibilidad=? WHERE id=?')
           ->execute([$nombre, $desc, $url, $icono, $cat, $row['owner_id'] === null ? $vis : 'todos', $id]);
    } else {
        $max = (int)$db->query('SELECT COALESCE(MAX(orden),0)+1 FROM apps')->fetchColumn();
        $db->prepare('INSERT INTO apps (nombre, descripcion, url, icono, categoria_id, orden, visibilidad, owner_id) VALUES (?,?,?,?,?,?,?,?)')
           ->execute([$nombre, $desc, $url, $icono, $cat, $max, $personal ? 'todos' : $vis, $personal ? $u['id'] : null]);
        $id = (int)$db->lastInsertId();
    }
    out(['ok' => true, 'id' => $id]);
}

case 'app_delete': {
    $u = need($db);
    $id = (int)($in['id'] ?? 0);
    $s = $db->prepare('SELECT owner_id FROM apps WHERE id = ?'); $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) fail('No existe', 404);
    if ($row['owner_id'] === null ? $u['rol'] !== 'admin' : (int)$row['owner_id'] !== $u['id']) fail('Sin permiso', 403);
    $db->prepare('DELETE FROM apps WHERE id = ?')->execute([$id]);
    out(['ok' => true]);
}

case 'cat_save': {
    need($db, true);
    $id = (int)($in['id'] ?? 0); $n = str($in['nombre'] ?? '', 50);
    if ($n === '') fail('Falta el nombre');
    if ($id) $db->prepare('UPDATE categorias SET nombre = ? WHERE id = ?')->execute([$n, $id]);
    else $db->prepare('INSERT INTO categorias (nombre, orden) VALUES (?, (SELECT COALESCE(MAX(orden),0)+1 FROM categorias))')->execute([$n]);
    out(['ok' => true]);
}

case 'cat_delete': {
    need($db, true);
    $db->prepare('DELETE FROM categorias WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
    out(['ok' => true]);
}

case 'cat_reorder': {
    need($db, true);
    foreach (array_map('intval', $in['ids'] ?? []) as $i => $id) $db->prepare('UPDATE categorias SET orden = ? WHERE id = ?')->execute([$i, $id]);
    out(['ok' => true]);
}

case 'users': {
    need($db, true);
    out(['users' => $db->query('SELECT id, usuario, nombre, rol, activo FROM users ORDER BY nombre')->fetchAll()]);
}

case 'user_save': {
    $me = need($db, true);
    $id = (int)($in['id'] ?? 0);
    $nombre = str($in['nombre'] ?? '', 60); $rol = ($in['rol'] ?? '') === 'admin' ? 'admin' : 'user';
    $activo = isset($in['activo']) && !$in['activo'] ? 0 : 1;
    $pass = (string)($in['password'] ?? '');
    if ($nombre === '') fail('Falta el nombre');
    if ($pass !== '' && strlen($pass) < 8) fail('La contraseña debe tener al menos 8 caracteres');
    if ($id) {
        if ($id === $me['id'] && ($rol !== 'admin' || !$activo)) fail('No podés quitarte tu propio acceso de administrador');
        // Chequeo ANTES de escribir: si este usuario es admin activo y lo degradan o desactivan, tiene que quedar otro.
        $prev = $db->prepare("SELECT rol, activo FROM users WHERE id = ?"); $prev->execute([$id]);
        $p = $prev->fetch();
        if (!$p) fail('No existe', 404);
        if ($p['rol'] === 'admin' && $p['activo'] && ($rol !== 'admin' || !$activo) && countAdmins($db) < 2) fail('Tiene que quedar al menos un administrador');
        $db->prepare('UPDATE users SET nombre=?, rol=?, activo=? WHERE id=?')->execute([$nombre, $rol, $activo, $id]);
        if ($pass !== '') $db->prepare('UPDATE users SET pass_hash=? WHERE id=?')->execute([password_hash($pass, PASSWORD_DEFAULT), $id]);
    } else {
        $usuario = strtolower(str($in['usuario'] ?? '', 40));
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $usuario)) fail('Usuario: 3 a 40 letras, números, punto o guion');
        if ($pass === '') fail('Falta la contraseña');
        try { $db->prepare('INSERT INTO users (usuario, nombre, pass_hash, rol, activo) VALUES (?,?,?,?,?)')->execute([$usuario, $nombre, password_hash($pass, PASSWORD_DEFAULT), $rol, $activo]); }
        catch (PDOException $e) { fail('Ese usuario ya existe'); }
    }
    out(['ok' => true]);
}

case 'user_delete': {
    $me = need($db, true);
    $id = (int)($in['id'] ?? 0);
    if ($id === $me['id']) fail('No podés borrarte a vos mismo');
    $t = $db->prepare("SELECT rol, activo FROM users WHERE id = ?"); $t->execute([$id]);
    $row = $t->fetch();
    if (!$row) fail('No existe', 404);
    if ($row['rol'] === 'admin' && $row['activo'] && countAdmins($db) < 2) fail('Tiene que quedar al menos un administrador');
    $db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    out(['ok' => true]);
}

default: fail('Acción desconocida', 404);
}
} catch (PDOException $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('panel_cindy: ' . $e->getMessage());
    fail('Error de base de datos', 500);
}
