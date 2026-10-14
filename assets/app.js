'use strict';
const S = { user: null, setup: false, cats: [], apps: [], edit: false, q: '', loaded: false };
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(action, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'panel' }, body: JSON.stringify(body) };
  let r, d;
  try { r = await fetch('api.php?action=' + action, opt); d = await r.json(); }
  catch (e) { throw new Error('No se pudo conectar con el servidor'); }
  if (r.status === 401 && S.user && action !== 'login') { S.user = null; render(); throw new Error('Tu sesión venció, volvé a entrar'); }
  if (!r.ok) throw new Error(d.error || 'Error inesperado');
  return d;
}
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
async function load() {
  const d = await api('state');
  S.user = d.user; S.setup = !!d.setup;
  if (d.user) { S.cats = d.categorias; S.apps = d.apps; }
  S.loaded = true; render();
}
async function act(fn, okMsg) {
  try { await fn(); await load(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message); }
}

/* ---------- Orden y agrupación (por usuario) ---------- */
const catKey = a => a.categoria_id ?? 0;
const byUser = (a, b) => ((a.orden ?? 1000 + a.orden_global) - (b.orden ?? 1000 + b.orden_global)) || a.id - b.id;
const byFav = (a, b) => ((a.orden_fav ?? 1000 + (a.orden ?? a.orden_global)) - (b.orden_fav ?? 1000 + (b.orden ?? b.orden_global))) || a.id - b.id;
const isAdmin = () => S.user?.rol === 'admin';
const canEdit = a => a.owner_id === null ? isAdmin() : a.owner_id === S.user.id;
const matches = a => !S.q || (a.nombre + ' ' + a.descripcion).toLowerCase().includes(S.q.toLowerCase());
function groups() {
  const visible = S.apps.filter(a => !a.oculta);
  const g = S.cats.map(c => ({ id: c.id, nombre: c.nombre, cat: true, items: visible.filter(a => catKey(a) === c.id).sort(byUser) }));
  const rest = visible.filter(a => !S.cats.some(c => c.id === catKey(a))).sort(byUser);
  if (rest.length) g.push({ id: 0, nombre: 'Otras herramientas', cat: false, items: rest });
  return g;
}

/* ---------- Vistas ---------- */
function render() {
  if (!S.loaded) { $app.innerHTML = ''; return; }
  if (!S.user) return renderAuth();
  const favs = S.apps.filter(a => a.favorita && !a.oculta).sort(byFav);
  const hidden = S.apps.filter(a => a.oculta).sort(byUser);
  const searching = S.q.trim() !== '';
  let body = '';
  if (searching) {
    const res = S.apps.filter(a => !a.oculta && matches(a)).sort(byUser);
    body = section('Resultados', 'search', res.length ? grid(res, 'res') : '<div class="empty">No hay herramientas que coincidan.</div>');
  } else {
    if (favs.length) body += section('Favoritas', 'star', grid(favs, 'fav'), null, true);
    for (const g of groups()) {
      if (!g.items.length && !S.edit) continue;
      body += section(g.nombre, null, grid(g.items, 'cat-' + g.id) + (S.edit ? addTile(g.id) : ''), g);
    }
    if (S.edit && hidden.length) body += section('Ocultas (solo vos no las ves)', 'eye-off', grid(hidden, 'hid'));
    if (!body) body = '<div class="empty">Todavía no hay herramientas. Activá "Personalizar" para agregar la primera.</div>';
    if (S.edit && isAdmin()) body += `<div class="sec"><button class="btn" data-a="cat-new">${icon('plus', 18)} Nueva categoría</button></div>`;
  }
  $app.innerHTML = `
  <header class="top"><div class="top-in">
    <div class="brand">CINDY<small>PANEL</small></div>
    <div class="search">${icon('search', 18)}<input id="q" type="search" placeholder="Buscar herramienta…  ( / )" value="${esc(S.q)}" autocomplete="off" aria-label="Buscar herramienta"></div>
    <div class="top-actions">
      ${isAdmin() ? `<button class="btn" data-a="users" title="Usuarios">${icon('users', 18)}<span class="lbl">Usuarios</span></button>` : ''}
      <button class="btn ${S.edit ? 'on' : ''}" data-a="toggle-edit" aria-pressed="${S.edit}">${icon(S.edit ? 'check' : 'sliders', 18)}<span class="lbl">${S.edit ? 'Listo' : 'Personalizar'}</span></button>
      <button class="btn icon" data-a="account" title="Mi cuenta" aria-label="Mi cuenta">${icon('lock', 18)}</button>
    </div>
  </div></header>
  <main class="${S.edit ? 'edit' : ''}">
    <div class="hello"><h1>Hola, ${esc(S.user.nombre.split(' ')[0])}</h1><p>${S.apps.filter(a => !a.oculta).length} herramientas</p></div>
    ${S.edit ? `<div class="editbar"><span>Modo personalizar: marcá favoritas con la estrella, ocultá las que no uses, reordenalas con las flechas o arrastrándolas, y agregá tus propios enlaces. Esto cambia solo <b>tu</b> panel${isAdmin() ? '; las herramientas y categorías del equipo las editás con el lápiz' : ''}.</span></div>` : ''}
    ${body}
  </main>`;
}
const section = (title, ic, inner, g, fav) => `<section class="sec"><div class="sec-h"><h2>${ic ? icon(ic, 16, ic === 'star') : ''}${esc(title)}</h2><div class="line"></div>${
  S.edit && g && g.cat && isAdmin() ? `<button class="chip" data-a="cat-up" data-id="${g.id}" aria-label="Subir categoría">${icon('arrow-up', 16)}</button><button class="chip" data-a="cat-down" data-id="${g.id}" aria-label="Bajar categoría">${icon('arrow-down', 16)}</button><button class="chip" data-a="cat-edit" data-id="${g.id}" aria-label="Renombrar categoría">${icon('pencil', 16)}</button><button class="chip danger" data-a="cat-del" data-id="${g.id}" aria-label="Borrar categoría">${icon('trash', 16)}</button>` : ''}</div>${inner}</section>`;
const addTile = cid => `<button class="tile add-tile" data-a="app-new" data-cat="${cid}">${icon('plus', 20)} Agregar herramienta</button>`;
const grid = (items, gid) => `<div class="grid" data-g="${gid}">${items.map(a => tile(a, gid)).join('')}</div>`;

function tile(a, gid) {
  const tags = (a.visibilidad === 'admin' && a.owner_id === null ? `<span class="tag">${icon('lock', 11)} Solo admin</span>` : '') + (a.owner_id !== null ? '<span class="tag">Mío</span>' : '');
  const attrs = `data-id="${a.id}" data-g="${gid}"`;
  if (!S.edit) {
    return `<a class="tile" href="${esc(a.url)}" target="_blank" rel="noopener" ${attrs}>
      <div class="badge">${icon(a.icono, 24)}</div>
      <div class="tile-body"><h3>${esc(a.nombre)}</h3>${a.descripcion ? `<p>${esc(a.descripcion)}</p>` : ''}${tags}</div>
      ${a.favorita && gid !== 'fav' ? `<span class="fav-mark" aria-label="Favorita">${icon('star', 16, true)}</span>` : ''}</a>`;
  }
  const inGroup = gid.startsWith('cat-') || gid === 'fav';
  const hid = a.oculta;
  return `<div class="tile ${hid ? 'hidden-t' : ''}" ${attrs} ${inGroup ? 'draggable="true"' : ''}>
    <div class="badge">${icon(a.icono, 24)}</div>
    <div class="tile-body"><h3>${esc(a.nombre)}</h3>${a.descripcion ? `<p>${esc(a.descripcion)}</p>` : ''}${tags}
      <div class="tile-tools">
        ${inGroup ? `<span class="chip grip" title="Arrastrar">${icon('grip', 16)}</span><button class="chip" data-a="up" aria-label="Mover antes">${icon('arrow-up', 16)}</button><button class="chip" data-a="down" aria-label="Mover después">${icon('arrow-down', 16)}</button>` : ''}
        ${hid ? '' : `<button class="chip ${a.favorita ? 'on' : ''}" data-a="fav" aria-label="${a.favorita ? 'Quitar de favoritas' : 'Marcar favorita'}" aria-pressed="${!!a.favorita}">${icon('star', 16, !!a.favorita)}</button>`}
        <button class="chip ${hid ? 'on' : ''}" data-a="hide" aria-label="${hid ? 'Volver a mostrar' : 'Ocultar'}">${icon(hid ? 'eye' : 'eye-off', 16)}</button>
        ${canEdit(a) ? `<button class="chip" data-a="app-edit" aria-label="Editar">${icon('pencil', 16)}</button><button class="chip danger" data-a="app-del" aria-label="Borrar">${icon('trash', 16)}</button>` : ''}
      </div></div></div>`;
}

function renderAuth() {
  const setup = S.setup;
  $app.innerHTML = `<div class="center"><form class="card" id="auth" autocomplete="on">
    <div class="brand">CINDY<small>PANEL</small></div>
    <h1>${setup ? 'Crear administrador' : 'Ingresá a tu panel'}</h1>
    <p class="sub">${setup ? 'Primera vez: creá la cuenta con la que vas a administrar el panel.' : 'Todas las herramientas del equipo en un solo lugar.'}</p>
    ${setup ? '<label class="f" for="nombre">Tu nombre</label><input class="in" id="nombre" name="name" required maxlength="60" autocomplete="name">' : ''}
    <label class="f" for="usuario">Usuario</label><input class="in" id="usuario" name="username" required maxlength="40" autocomplete="username" autocapitalize="none" spellcheck="false">
    <label class="f" for="password">Contraseña${setup ? ' (mínimo 8 caracteres)' : ''}</label><input class="in" id="password" name="password" type="password" required autocomplete="${setup ? 'new-password' : 'current-password'}">
    <p class="err" id="err" role="alert"></p>
    <button class="btn primary" style="width:100%;margin-top:8px">${setup ? 'Crear y entrar' : 'Entrar'}</button>
  </form></div>`;
  document.getElementById('auth').onsubmit = async e => {
    e.preventDefault();
    const v = id => document.getElementById(id)?.value ?? '';
    try { await api(setup ? 'setup' : 'login', { usuario: v('usuario'), password: v('password'), nombre: v('nombre') }); await load(); }
    catch (er) { document.getElementById('err').textContent = er.message; }
  };
  document.getElementById(setup ? 'nombre' : 'usuario').focus();
}

/* ---------- Modales ---------- */
function modal(html, onMount) {
  closeModal();
  const o = document.createElement('div'); o.className = 'overlay'; o.id = 'ov';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('mousedown', e => { if (e.target === o) closeModal(); });
  document.body.appendChild(o);
  const first = o.querySelector('input,select,textarea,button'); first && first.focus();
  onMount && onMount(o);
  return o;
}
const closeModal = () => document.getElementById('ov')?.remove();

function appForm(app, catId) {
  const editing = !!app;
  const admin = isAdmin();
  // Un admin elige si es herramienta del equipo o enlace personal; el resto solo personales.
  const personal = editing ? app.owner_id !== null : !admin;
  let icono = app?.icono || 'link';
  const catOpts = `<option value="">Sin categoría</option>` + S.cats.map(c => `<option value="${c.id}" ${(app ? app.categoria_id : catId) === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  modal(`<h2>${editing ? 'Editar herramienta' : 'Agregar herramienta'}</h2>
    <form id="af">
      ${!editing && admin ? `<div class="tabs" role="tablist"><button type="button" data-w="team" class="on">Para el equipo</button><button type="button" data-w="mine">Solo para mí</button></div>` : ''}
      <label class="f" for="a-n">Nombre</label><input class="in" id="a-n" required maxlength="60" value="${esc(app?.nombre)}">
      <label class="f" for="a-u">Dirección (URL)</label><input class="in" id="a-u" required maxlength="500" placeholder="https://…" value="${esc(app?.url)}" inputmode="url" autocapitalize="none">
      <label class="f" for="a-d">Descripción corta (opcional)</label><input class="in" id="a-d" maxlength="140" value="${esc(app?.descripcion)}">
      <label class="f" for="a-c">Categoría</label><select class="in" id="a-c">${catOpts}</select>
      <div id="a-vis" ${personal ? 'hidden' : ''}><label class="f" for="a-v">Quién la ve</label><select class="in" id="a-v"><option value="todos" ${app?.visibilidad !== 'admin' ? 'selected' : ''}>Todo el equipo</option><option value="admin" ${app?.visibilidad === 'admin' ? 'selected' : ''}>Solo administradores</option></select></div>
      <label class="f">Ícono</label><div class="icons">${PICKABLE.map(n => `<button type="button" data-i="${n}" class="${n === icono ? 'sel' : ''}" aria-label="${n}">${icon(n, 20)}</button>`).join('')}</div>
      <p class="err" id="err" role="alert"></p>
      <div class="modal-actions"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar</button></div>
    </form>`, o => {
    let mine = personal;
    o.querySelector('[data-x]').onclick = closeModal;
    o.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { icono = b.dataset.i; o.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('sel', x === b)); });
    o.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { mine = b.dataset.w === 'mine'; o.querySelectorAll('[data-w]').forEach(x => x.classList.toggle('on', x === b)); o.querySelector('#a-vis').hidden = mine; });
    o.querySelector('#af').onsubmit = async e => {
      e.preventDefault();
      const g = id => o.querySelector(id).value;
      try {
        await api('app_save', { id: app?.id, personal: mine, nombre: g('#a-n'), url: g('#a-u'), descripcion: g('#a-d'), categoria_id: g('#a-c') || null, visibilidad: g('#a-v'), icono });
        closeModal(); await load(); toast('Guardado');
      } catch (er) { o.querySelector('#err').textContent = er.message; }
    };
  });
}

function catForm(cat) {
  modal(`<h2>${cat ? 'Renombrar categoría' : 'Nueva categoría'}</h2><form id="cf"><label class="f" for="c-n">Nombre</label><input class="in" id="c-n" required maxlength="50" value="${esc(cat?.nombre)}"><p class="err" id="err" role="alert"></p><div class="modal-actions"><button type="button" class="btn" data-x>Cancelar</button><button class="btn primary">Guardar</button></div></form>`, o => {
    o.querySelector('[data-x]').onclick = closeModal;
    o.querySelector('#cf').onsubmit = async e => { e.preventDefault(); try { await api('cat_save', { id: cat?.id, nombre: o.querySelector('#c-n').value }); closeModal(); await load(); toast('Guardado'); } catch (er) { o.querySelector('#err').textContent = er.message; } };
  });
}

async function usersModal() {
  let list;
  try { list = (await api('users')).users; } catch (e) { return toast(e.message); }
  const rows = list.map(u => `<div class="row"><div class="grow"><b>${esc(u.nombre)}</b> <small>${esc(u.usuario)} · ${u.rol === 'admin' ? 'Administrador' : 'Usuario'}${u.activo ? '' : ' · Desactivado'}</small></div>
    <button class="chip" data-ue="${u.id}" aria-label="Editar ${esc(u.nombre)}">${icon('pencil', 16)}</button>${u.id !== S.user.id ? `<button class="chip danger" data-ud="${u.id}" aria-label="Borrar ${esc(u.nombre)}">${icon('trash', 16)}</button>` : ''}</div>`).join('');
  modal(`<h2>Usuarios</h2>${rows}<div class="modal-actions"><button class="btn" data-x>Cerrar</button><button class="btn primary" data-un>${icon('plus', 18)} Nuevo usuario</button></div>`, o => {
    o.querySelector('[data-x]').onclick = closeModal;
    o.querySelector('[data-un]').onclick = () => userForm(null);
    o.querySelectorAll('[data-ue]').forEach(b => b.onclick = () => userForm(list.find(u => u.id == b.dataset.ue)));
    o.querySelectorAll('[data-ud]').forEach(b => b.onclick = async () => {
      const u = list.find(x => x.id == b.dataset.ud);
      if (!confirm(`¿Borrar a ${u.nombre}? Se pierden también sus enlaces y preferencias.`)) return;
      try { await api('user_delete', { id: u.id }); toast('Usuario borrado'); usersModal(); } catch (e) { toast(e.message); }
    });
  });
}
function userForm(u) {
  modal(`<h2>${u ? 'Editar usuario' : 'Nuevo usuario'}</h2><form id="uf">
    ${u ? '' : '<label class="f" for="u-u">Usuario</label><input class="in" id="u-u" required maxlength="40" autocapitalize="none" spellcheck="false">'}
    <label class="f" for="u-n">Nombre</label><input class="in" id="u-n" required maxlength="60" value="${esc(u?.nombre)}">
    <label class="f" for="u-p">${u ? 'Nueva contraseña (vacío = no cambia)' : 'Contraseña (mínimo 8)'}</label><input class="in" id="u-p" type="password" autocomplete="new-password" ${u ? '' : 'required'}>
    <label class="f" for="u-r">Rol</label><select class="in" id="u-r"><option value="user" ${u?.rol !== 'admin' ? 'selected' : ''}>Usuario</option><option value="admin" ${u?.rol === 'admin' ? 'selected' : ''}>Administrador</option></select>
    ${u ? `<label class="f" for="u-a">Estado</label><select class="in" id="u-a"><option value="1" ${u.activo ? 'selected' : ''}>Activo</option><option value="0" ${!u.activo ? 'selected' : ''}>Desactivado</option></select>` : ''}
    <p class="err" id="err" role="alert"></p><div class="modal-actions"><button type="button" class="btn" data-x>Volver</button><button class="btn primary">Guardar</button></div></form>`, o => {
    o.querySelector('[data-x]').onclick = usersModal;
    o.querySelector('#uf').onsubmit = async e => {
      e.preventDefault();
      const g = id => o.querySelector(id)?.value;
      try { await api('user_save', { id: u?.id, usuario: g('#u-u'), nombre: g('#u-n'), password: g('#u-p'), rol: g('#u-r'), activo: u ? g('#u-a') === '1' : true }); toast('Guardado'); usersModal(); }
      catch (er) { o.querySelector('#err').textContent = er.message; }
    };
  });
}

function accountModal() {
  modal(`<h2>${esc(S.user.nombre)}</h2><p class="sub" style="color:var(--ink-2);margin:0 0 8px">${esc(S.user.usuario)} · ${S.user.rol === 'admin' ? 'Administrador' : 'Usuario'}</p>
    <form id="pf"><label class="f" for="p-a">Contraseña actual</label><input class="in" id="p-a" type="password" autocomplete="current-password" required>
    <label class="f" for="p-n">Nueva contraseña (mínimo 8)</label><input class="in" id="p-n" type="password" autocomplete="new-password" required>
    <p class="err" id="err" role="alert"></p><button class="btn">Cambiar contraseña</button></form>
    <div class="row" style="margin-top:14px;border:0"><div class="grow"><b>Restaurar mi panel</b><small>Borra tus favoritas, ocultas y orden. Tus enlaces propios se conservan.</small></div><button class="btn sm" data-reset>${icon('rotate-ccw', 16)} Restaurar</button></div>
    <div class="modal-actions"><button class="btn" data-x>Cerrar</button><button class="btn danger" data-out>${icon('log-out', 18)} Salir</button></div>`, o => {
    o.querySelector('[data-x]').onclick = closeModal;
    o.querySelector('[data-out]').onclick = async () => { await api('logout', {}); closeModal(); S.edit = false; S.q = ''; await load(); };
    o.querySelector('[data-reset]').onclick = () => { if (confirm('¿Restaurar el orden y las preferencias de tu panel?')) { closeModal(); act(() => api('reset_prefs', {}), 'Panel restaurado'); } };
    o.querySelector('#pf').onsubmit = async e => { e.preventDefault(); try { await api('password', { actual: o.querySelector('#p-a').value, nueva: o.querySelector('#p-n').value }); closeModal(); toast('Contraseña cambiada'); } catch (er) { o.querySelector('#err').textContent = er.message; } };
  });
}

/* ---------- Acciones ---------- */
const appById = id => S.apps.find(a => a.id == id);
function move(id, gid, dir) {
  const ids = [...document.querySelectorAll(`.grid[data-g="${gid}"] > .tile`)].map(t => +t.dataset.id);
  const i = ids.indexOf(+id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  act(() => api('reorder', { scope: gid === 'fav' ? 'fav' : 'cat', ids }));
}
function moveCat(id, dir) {
  const ids = S.cats.map(c => c.id), i = ids.indexOf(+id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  act(() => api('cat_reorder', { ids }));
}

$app.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const t = b.closest('.tile'); const id = t?.dataset.id, gid = t?.dataset.g;
  switch (b.dataset.a) {
    case 'toggle-edit': S.edit = !S.edit; S.q = ''; render(); break;
    case 'users': usersModal(); break;
    case 'account': accountModal(); break;
    case 'app-new': appForm(null, +b.dataset.cat || null); break;
    case 'app-edit': appForm(appById(id)); break;
    case 'app-del': { const a = appById(id); if (confirm(`¿Borrar "${a.nombre}"?` + (a.owner_id === null ? ' Desaparece para todo el equipo.' : ''))) act(() => api('app_delete', { id: a.id }), 'Borrada'); break; }
    case 'fav': act(() => api('pref', { app_id: +id, favorita: !appById(id).favorita })); break;
    case 'hide': act(() => api('pref', { app_id: +id, oculta: !appById(id).oculta }), appById(id).oculta ? 'Herramienta visible otra vez' : 'Oculta (la recuperás en Personalizar)'); break;
    case 'up': move(id, gid, -1); break;
    case 'down': move(id, gid, 1); break;
    case 'cat-new': catForm(null); break;
    case 'cat-edit': catForm(S.cats.find(c => c.id == b.dataset.id)); break;
    case 'cat-del': { const c = S.cats.find(c => c.id == b.dataset.id); if (confirm(`¿Borrar la categoría "${c.nombre}"? Sus herramientas pasan a "Otras herramientas".`)) act(() => api('cat_delete', { id: c.id }), 'Categoría borrada'); break; }
    case 'cat-up': moveCat(b.dataset.id, -1); break;
    case 'cat-down': moveCat(b.dataset.id, 1); break;
  }
});

// Buscador: re-renderiza conservando el foco; Enter abre el primer resultado.
$app.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  S.q = e.target.value; render();
  const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
});
$app.addEventListener('keydown', e => {
  if (e.target.id === 'q' && e.key === 'Enter') { const first = S.apps.filter(a => !a.oculta && matches(a)).sort(byUser)[0]; if (first) window.open(first.url, '_blank', 'noopener'); }
  if (e.target.id === 'q' && e.key === 'Escape') { S.q = ''; render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && S.user) { e.preventDefault(); document.getElementById('q')?.focus(); }
  if (e.key === 'Escape') closeModal();
});

// Arrastrar y soltar (escritorio). En celular se usan las flechas.
let drag = null;
$app.addEventListener('dragstart', e => { const t = e.target.closest('.tile[draggable]'); if (!t) return; drag = t; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.dataset.id); });
$app.addEventListener('dragover', e => { const t = e.target.closest('.tile[draggable]'); if (!drag || !t || t === drag || t.dataset.g !== drag.dataset.g) return; e.preventDefault(); document.querySelectorAll('.over').forEach(x => x.classList.remove('over')); t.classList.add('over'); });
$app.addEventListener('drop', e => {
  const t = e.target.closest('.tile[draggable]'); if (!drag || !t || t === drag || t.dataset.g !== drag.dataset.g) return;
  e.preventDefault();
  const items = [...t.parentElement.querySelectorAll(':scope > .tile')];
  const from = items.indexOf(drag), to = items.indexOf(t);
  items.splice(from, 1); items.splice(to, 0, drag);
  const gid = drag.dataset.g, ids = items.map(x => +x.dataset.id);
  act(() => api('reorder', { scope: gid === 'fav' ? 'fav' : 'cat', ids }));
});
$app.addEventListener('dragend', () => { drag = null; document.querySelectorAll('.dragging,.over').forEach(x => x.classList.remove('dragging', 'over')); });

load().catch(e => { $app.innerHTML = `<div class="center"><div class="card"><h1>No se pudo cargar</h1><p class="sub">${esc(e.message)}</p></div></div>`; });
