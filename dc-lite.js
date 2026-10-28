/* Minimal runtime: renders an HTML template with {{values}}, sc-for / sc-if, and keeps the DOM in sync on state changes. */
(function () {
  var HANDLERS = { onclick: 1, oninput: 1, onchange: 1, onsubmit: 1 };

  function lookup(path, scope) {
    path = path.trim();
    var parts = path.split('.');
    var v = scope[parts[0]];
    for (var i = 1; i < parts.length && v != null; i++) v = v[parts[i]];
    return v;
  }
  var FULL = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function interp(str, scope) {
    return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'sc-for') {
      var list = lookup(node.getAttribute('list').replace(/^\{\{|\}\}$/g, ''), scope) || [];
      var as = node.getAttribute('as');
      list.forEach(function (item) {
        var s = Object.create(scope); s[as] = item;
        for (var c = node.firstChild; c; c = c.nextSibling) build(c, s, out);
      });
      return;
    }
    if (tag === 'sc-if') {
      var val = lookup(node.getAttribute('value').replace(/^\{\{|\}\}$/g, ''), scope);
      if (val) for (var c2 = node.firstChild; c2; c2 = c2.nextSibling) build(c2, scope, out);
      return;
    }
    var el = node.cloneNode(false);
    var attrs = Array.prototype.slice.call(node.attributes);
    attrs.forEach(function (a) {
      var name = a.name;
      if (HANDLERS[name]) {
        el.removeAttribute(name);
        var m = FULL.exec(a.value);
        var fn = m ? lookup(m[1], scope) : null;
        el['__' + name] = fn; el[name] = typeof fn === 'function' ? fn : null;
      } else if (a.value.indexOf('{{') > -1) {
        el.setAttribute(name, interp(a.value, scope));
      }
    });
    var kids = [];
    for (var ch = node.firstChild; ch; ch = ch.nextSibling) build(ch, scope, kids);
    kids.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  function patch(live, next) {
    if (live.nodeType !== next.nodeType || live.nodeName !== next.nodeName) {
      live.parentNode.replaceChild(next, live); return;
    }
    if (live.nodeType === 3) { if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue; return; }
    // attributes
    Array.prototype.slice.call(live.attributes).forEach(function (a) {
      if (!next.hasAttribute(a.name)) live.removeAttribute(a.name);
    });
    Array.prototype.slice.call(next.attributes).forEach(function (a) {
      if (live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
    });
    Object.keys(HANDLERS).forEach(function (h) {
      var f = next['__' + h]; live['__' + h] = f;
      live[h] = typeof f === 'function' ? f : null;
    });
    if (live.localName === 'input' && live.value !== next.getAttribute('value')) live.value = next.getAttribute('value');
    // children
    var l = live.firstChild, n = next.firstChild;
    while (n) {
      var nn = n.nextSibling;
      if (!l) live.appendChild(n); else { var ln = l.nextSibling; patch(l, n); l = ln; }
      n = nn;
    }
    while (l) { var r = l.nextSibling; live.removeChild(l); l = r; }
  }

  window.DCLogic = class {
    constructor(props) { this.props = props || {}; this.state = {}; this._q = false; }
    setState(p) {
      this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p);
      if (this._q || !this._root) return;
      this._q = true;
      var self = this;
      requestAnimationFrame(function () { self._q = false; self._render(); });
    }
    _render() {
      var scope = this.renderVals();
      var out = [];
      for (var c = this._tpl.content.firstChild; c; c = c.nextSibling) build(c, scope, out);
      var holder = document.createElement('div');
      out.forEach(function (o) { holder.appendChild(o); });
      var live = this._root, l = live.firstChild, n = holder.firstChild;
      while (n) { var nn = n.nextSibling; if (!l) live.appendChild(n); else { var ln = l.nextSibling; patch(l, n); l = ln; } n = nn; }
      while (l) { var r = l.nextSibling; live.removeChild(l); l = r; }
    }
    mount(tpl, root) {
      this._tpl = tpl; this._root = root;
      this._render();
      if (this.componentDidMount) this.componentDidMount();
    }
  };
})();
