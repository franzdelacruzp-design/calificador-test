const HOJA = (function () {
  const A4 = { w: 210, h: 297 };

  // Centros de las marcas de esquina (mm). La de arriba a la izquierda es mayor.
  const MARCAS = [
    { id: 'TL', x: 12, y: 12, lado: 12 },
    { id: 'TR', x: 198, y: 12, lado: 8 },
    { id: 'BL', x: 12, y: 285, lado: 8 },
    { id: 'BR', x: 198, y: 285, lado: 8 }
  ];

  const RADIO = 2.5;
  const DNI = { x0: 124, dx: 8.5, y0: 40, dy: 5.6, cols: 8 };
  const PREG = { x0: 18, anchoCol: 43.5, y0: 104, dy: 7, filasPorCol: 25, numAncho: 9, dx: 5.8 };

  function calcular(alternativas) {
    const dni = [];
    for (let c = 0; c < DNI.cols; c++) {
      for (let d = 0; d < 10; d++) {
        dni.push({ col: c, valor: d, x: DNI.x0 + c * DNI.dx, y: DNI.y0 + d * DNI.dy });
      }
    }
    const preguntas = alternativas.map(function (a, i) {
      const col = Math.floor(i / PREG.filasPorCol);
      const fila = i % PREG.filasPorCol;
      const xCol = PREG.x0 + col * PREG.anchoCol;
      const y = PREG.y0 + fila * PREG.dy;
      const burbujas = [];
      for (let j = 0; j < a; j++) {
        burbujas.push({ opcion: j, x: xCol + PREG.numAncho + j * PREG.dx, y: y });
      }
      return { numero: i + 1, xNum: xCol, y: y, burbujas: burbujas };
    });
    return { A4: A4, marcas: MARCAS, radio: RADIO, dni: dni, preguntas: preguntas, DNI: DNI };
  }

  return { calcular: calcular, A4: A4, RADIO: RADIO };
})();
