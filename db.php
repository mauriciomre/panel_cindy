<?php
// Panel Cindy — SQLite (archivo en data/, bloqueado por data/.htaccess)
function getDB(): PDO {
    static $db = null;
    if ($db) return $db;
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $db = new PDO('sqlite:' . $dir . '/panel.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'user',
        activo INTEGER NOT NULL DEFAULT 1
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        icono TEXT NOT NULL DEFAULT 'link',
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        visibilidad TEXT NOT NULL DEFAULT 'todos',
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS prefs (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
        favorita INTEGER NOT NULL DEFAULT 0,
        oculta INTEGER NOT NULL DEFAULT 0,
        orden INTEGER,
        orden_fav INTEGER,
        PRIMARY KEY (user_id, app_id)
    )");
    return $db;
}
