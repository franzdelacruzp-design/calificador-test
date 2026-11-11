(function (root) {
  'use strict';
  // ---- Parámetros ajustables ----
  var T_HI = 0.35;          // Reducido a 0.35 para ser más tolerante con lápices/lapiceros claros
  var T_LO = 0.15;          // Marca débil (dudosa)
  var PXMM_MIN = 1.6;       
  var RATIO_ESPERADO = 273 / 186;  
  var OFFS = (function () {
    var a = [];
    for (var i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++) a.push([i * 0.85, j * 0.85]);
    return a;
  })();

  // ---- Preparación del examen ----
  function preparar(HOJA, alternativas) {
    var L = HOJA.calcular(alternativas);
    var bub = [];
    var dniIdx = [];
    for (var c = 0; c < L.DNI.cols; c++) {
      var arr = [];
      for (var d = 0; d < 10; d++) {
        var b = L.dni[c * 10 + d];
        arr.push(bub.length);
        bub.push({ x: b.x, y: b.y, ref: [[b.x - 4.25, b.y], [b.x + 4.25, b.y]] });
      }
      dniIdx.push(arr);
    }
    var pregIdx = L.preguntas.map(function (p) {
      return p.burbujas.map(function (b) {
        bub.push({ x: b.x, y: b.y, ref: [[b.x, b.y - 3.5], [b.x, b.y + 3.5]] });
        return bub.length - 1;
      });
    });
    var m = {};
    var lado = {};
    L.marcas.forEach(function (k) { m[k.id] = [k.x, k.y]; lado[k.id] = k.lado; });
    return {
      L: L, bub: bub, dniIdx: dniIdx, pregIdx: pregIdx,
      marcasMM: [m.TL, m.TR, m.BR, m.BL], ladoMM: [lado.TL, lado.TR, lado.BR, lado.BL], radio: L.radio
    };
  }

  // ---- Imagen ----
  function aGris(rgba, n) {
    var g = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      g[i] = (rgba[j] * 77 + rgba[j + 1] * 151 + rgba[j + 2] * 28) >> 8;
    }
    return g;
  }
  function binarizar(g, w, h) {
    var W = w + 1;
    var I = new Uint32Array(W * (h + 1));
    for (var y = 0; y < h; y++) {
      var fila = 0;
      for (var x = 0; x < w; x++) {
        fila += g[y * w + x];
        I[(y + 1) * W + (x + 1)] = I[y * W + (x + 1)] + fila;
      }
    }
    var r = Math.max(8, Math.round(Math.max(w, h) / 16));
    var bin = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        var area = (x1 - x0) * (y1 - y0);
        var s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
        if (g[y * w + x] * area < s * 0.6) bin[y * w + x] = 1;
      }
    }
    return bin;
  }
  function componentes(bin, w, h) {
    var n = w * h;
    var visto = new Uint8Array(n);
    var pila = new Int32Array(n);
    var comps = [];
    for (var i = 0; i < n; i++) {
      if (!bin[i] || visto[i]) continue;
      var sp = 0;
      pila[sp++] = i; visto[i] = 1;
      var area = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      while (sp > 0) {
        var p = pila[--sp];
        var x = p % w, y = (p - x) / w;
        area++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && bin[p - 1] && !visto[p - 1]) { visto[p - 1] = 1; pila[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !visto[p + 1]) { visto[p + 1] = 1; pila[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !visto[p - w]) { visto[p - w] = 1; pila[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !visto[p + w]) { visto[p + w] = 1; pila[sp++] = p + w; }
      }
      var mx = sx / area, my = sy / area;
      var vxx = sxx / area - mx * mx, vyy = syy / area - my * my, vxy = sxy / area - mx * my;
      var tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
      var disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      var l1 = tr / 2 + disc, l2 = tr / 2 - disc;
      comps.push({ area: area, cx: mx, cy: my, minx: minx, maxx: maxx, miny: miny, maxy: maxy, iso: l1 > 0 ? l2 / l1 : 0 });
    }
    return comps;
  }

  // ---- Búsqueda de las 4 marcas (Con tolerancia mejorada) ----
  function evaluar(q) {
    var mx = (q[0].cx + q[1].cx + q[2].cx + q[3].cx) / 4;
    var my = (q[0].cy + q[1].cy + q[2].cy + q[3].cy) / 4;
    var o = q.slice().sort(function (a, b) {
      return Math.atan2(a.cy - my, a.cx - mx) - Math.atan2(b.cy - my, b.cx - mx);
    });
    var iMax = 0;
    for (var i = 1; i < 4; i++) if (o[i].area > o[iMax].area) iMax = i;
    var p = [o[iMax], o[(iMax + 1) % 4], o[(iMax + 2) % 4], o[(iMax + 3) % 4]]; 
    var signo = 0;
    for (i = 0; i < 4; i++) {
      var a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
      var z = (b.cx - a.cx) * (c.cy - b.cy) - (b.cy - a.cy) * (c.cx - b.cx);
      if (z === 0) return null;
      var s = z > 0 ? 1 : -1;
      if (signo === 0) signo = s; else if (s !== signo) return null;
    }
    var d = function (u, v) { return Math.hypot(u.cx - v.cx, u.cy - v.cy); };
    var top = d(p[0], p[1]), right = d(p[1], p[2]), bottom = d(p[2], p[3]), left = d(p[3], p[0]);
    // Tolerancia relaja de 0.55/1.8 a 0.45/2.2 para aceptar perspectiva de la cámara
    if (top / bottom < 0.45 || top / bottom > 2.2 || left / right < 0.45 || left / right > 2.2) return null;
    var errRatio = Math.abs(Math.log(((left + right) / (top + bottom)) / RATIO_ESPERADO));
    if (errRatio > 0.4) return null; // Tolerancia subida a 0.4
    var otros = (p[1].area + p[2].area + p[3].area) / 3;
    var rel = p[0].area / otros;
    if (rel < 1.0 || rel > 5.5) return null; // Tolerancia subida
    var mn = Math.min(p[1].area, p[2].area, p[3].area);
    var mxa = Math.max(p[1].area, p[2].area, p[3].area);
    if (mxa / mn > 3.0) return null; // Tolerancia subida
    var score = errRatio + 0.3 * Math.abs(Math.log(rel / 2.25)) + 0.2 * Math.log(mxa / mn);
    return { p: p, score: score, suma: p[0].area + p[1].area + p[2].area + p[3].area, lados: [top, right, bottom, left] };
  }

  function areaPoligono(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }

  function consistente(r, P) {
    var dst = r.p.map(function (k) { return [k.cx, k.cy]; });
    var H = homografia(P.marcasMM, dst);
    if (!H) return false;
    for (var i = 0; i < 4; i++) {
      var mm = P.marcasMM[i], l = P.ladoMM[i] / 2;
      var esp = areaPoligono([
        proyectar(H, mm[0] - l, mm[1] - l), proyectar(H, mm[0] + l, mm[1] - l),
        proyectar(H, mm[0] + l, mm[1] + l), proyectar(H, mm[0] - l, mm[1] + l)]);
      var ratio = r.p[i].area / esp;
      if (ratio < 0.5 || ratio > 2.0) return false; // Tolerancia ampliada de 0.65 a 0.5
    }
    return true;
  }

  function buscarMarcas(comps, w, h, P) {
    var maxA = 0.04 * w * h, minA = 40; // minA bajado a 40 por menor resolución
    var c = comps.filter(function (k) {
      var bw = k.maxx - k.minx + 1, bh = k.maxy - k.miny + 1;
      var asp = bw / bh;
      return k.area >= minA && k.area <= maxA && asp > 0.45 && asp < 2.2 && k.area / (bw * bh) > 0.45 &&
             k.iso > 0.5 && k.minx > 0 && k.miny > 0 && k.maxx < w - 1 && k.maxy < h - 1;
    });
    c.sort(function (a, b) { return b.area - a.area; });
    c = c.slice(0, 9);
    var mejor = null;
    for (var i = 0; i < c.length; i++)
      for (var j = i + 1; j < c.length; j++)
        for (var k = j + 1; k < c.length; k++)
          for (var l = k + 1; l < c.length; l++) {
            var r = evaluar([c[i], c[j], c[k], c[l]]);
            if (r && r.score <= 0.45 && (!mejor || r.suma > mejor.suma) && consistente(r, P)) mejor = r;
          }
    return mejor;
  }

  // ---- Homografía (mm -> píxeles) ----
  function homografia(src, dst) {
    var M = [];
    for (var i = 0; i < 4; i++) {
      var X = src[i][0], Y = src[i][1], x = dst[i][0], y = dst[i][1];
      M.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y, x]);
      M.push([0, 0, 0, X, Y, 1, -y * X, -y * Y, y]);
    }
    var n = 8;
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    var h = [];
    for (i = 0; i < n; i++) h.push(M[i][n] / M[i][i]);
    return h;
  }

  function proyectar(h, X, Y) {
    var d = h[6] * X + h[7] * Y + 1;
    return [(h[0] * X + h[1] * Y + h[2]) / d, (h[3] * X + h[4] * Y + h[5]) / d];
  }

  function bil(g, w, h, x, y) {
    if (!(x >= 0 && y >= 0 && x < w - 1 && y < h - 1)) return -1;
    var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  }

  // ---- Decisión por grupo de círculos ----
  function decidir(fs) {
    var nHi = 0, iHi = -1, iMax = 0;
    for (var i = 0; i < fs.length; i++) {
      if (fs[i] >= T_HI) { nHi++; iHi = i; }
      if (fs[i] > fs[iMax]) iMax = i;
    }
    if (nHi === 1) return { estado: 'ok', valor: iHi };
    if (nHi >= 2) return { estado: 'doble', valor: null };
    if (fs[iMax] >= T_LO) return { estado: 'dudosa', valor: iMax };
    return { estado: 'blanco', valor: null };
  }

  // ---- Lectura principal ----
  function leer(rgba, w, h, P) {
    var g = aGris(rgba, w * h);
    var bin = binarizar(g, w, h);
    var comps = componentes(bin, w, h);
    var q = buscarMarcas(comps, w, h, P);
    if (!q) return { ok: false, motivo: 'No veo las 4 marcas de las esquinas' };
    var dst = q.p.map(function (k) { return [k.cx, k.cy]; });
    var H = homografia(P.marcasMM, dst);
    if (!H) return { ok: false, motivo: 'No se pudo calcular la posición de la hoja' };
    var pxmm = (q.lados[0] / 186 + q.lados[2] / 186 + q.lados[1] / 273 + q.lados[3] / 273) / 4;
    var base = { H: H, quad: dst, pxmm: pxmm };
    if (pxmm < PXMM_MIN) return Object.assign({ ok: false, motivo: 'Acerca más la cámara a la hoja' }, base);
    
    var n = P.bub.length;
    var m = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var o = 0; o < OFFS.length; o++) {
        var pt = proyectar(H, P.bub[i].x + OFFS[o][0], P.bub[i].y + OFFS[o][1]);
        var v = bil(g, w, h, pt[0], pt[1]);
        if (v < 0) return Object.assign({ ok: false, motivo: 'La hoja sale cortada de la imagen' }, base);
        s += v;
      }
      m[i] = s / OFFS.length;
    }
    var f = new Float64Array(n);
    var Emed = [];
    for (i = 0; i < n; i++) {
      var refMax = -1;
      for (var rr = 0; rr < 2; rr++) {
        var rp = P.bub[i].ref[rr];
        var sr = 0, cr = 0;
        for (var a = -1; a <= 1; a++) for (var b2 = -1; b2 <= 1; b2++) {
          var q2 = proyectar(H, rp[0] + a * 0.5, rp[1] + b2 * 0.5);
          var v2 = bil(g, w, h, q2[0], q2[1]);
          if (v2 >= 0) { sr += v2; cr++; }
        }
        if (cr > 0 && sr / cr > refMax) refMax = sr / cr;
      }
      if (refMax < 0) return Object.assign({ ok: false, motivo: 'La hoja sale cortada de la imagen' }, base);
      Emed.push(refMax);
      f[i] = Math.max(0, (refMax - m[i]) / Math.max(refMax, 1));
    }

    var sm = 0, cm = 0;
    P.marcasMM.forEach(function (mk) {
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var pt = proyectar(H, mk[0] + d[0], mk[1] + d[1]);
        var v = bil(g, w, h, pt[0], pt[1]);
        if (v >= 0) { sm += v; cm++; }
      });
    });
    Emed.sort(function (a, b) { return a - b; });
    var papel = Emed[Math.floor(Emed.length / 2)];
    var contraste = cm ? (1 - (sm / cm) / papel) : 0;

    var dig = '', dniOk = true;
    var dniEst = [];
    for (var c = 0; c < P.dniIdx.length; c++) {
      var fs = P.dniIdx[c].map(function (ix) { return f[ix]; });
      var r = decidir(fs);
      dniEst.push(r.estado);
      if (r.estado === 'ok') dig += r.valor;
      else if (r.estado === 'doble') { dig += '!'; dniOk = false; }
      else { dig += '?'; dniOk = false; }
    }

    var resp = P.pregIdx.map(function (idxs, k) {
      var fs2 = idxs.map(function (ix) { return f[ix]; });
      var r2 = decidir(fs2);
      return { n: k + 1, estado: r2.estado, valor: r2.valor, f: Array.prototype.map.call(fs2, function (x) { return Math.round(x * 100) / 100; }) };
    });

    var res = { ok: 0, blanco: 0, doble: 0, dudosa: 0 };
    resp.forEach(function (r3) { res[r3.estado]++; });
    var firma = dig + '|' + resp.map(function (r4) { return r4.estado[0] + (r4.valor === null ? '-' : r4.valor); }).join('');
    
    return Object.assign({
      ok: true, dni: { texto: dig, completo: dniOk, estados: dniEst },
      respuestas: resp, resumen: res, contraste: contraste, firma: firma, f: f
    }, base);
  }

  var api = { preparar: preparar, leer: leer, proyectar: proyectar, T_HI: T_HI, T_LO: T_LO };
  
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LECTOR = api;

  // ---- INTEGRACIÓN WEB WORKER ----
  if (typeof document === 'undefined' && typeof self !== 'undefined' && self.addEventListener) {
    self.addEventListener('message', function(e) {
      var d = e.data;
      if (d.accion === 'leer') {
        try {
          var r = api.leer(d.rgba, d.w, d.h, d.P);
          self.postMessage({ r: r });
        } catch(err) {
          self.postMessage({ r: { ok: false, motivo: 'Error interno: ' + err.message } });
        }
      }
    });
  }
})(typeof self !== 'undefined' ? self : this);
