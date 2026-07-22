    const SAT_ORIGEN = -53;   // Intelsat 23, 53° Oeste
    const SAT_DESTINO = -67;  // SES-10, 67° Oeste
    let sensorDetectado = false;

    // ---------- Tabs ----------
    // IMPORTANTE: switchTab está delimitado al "modo" (Cambiar de satélite / Apuntar
    // nueva antena) al que pertenece el botón tocado. Antes buscaba .tab-btn/.tab-panel
    // en TODO el documento, así que tocar una pestaña en un modo desactivaba sin
    // querer las pestañas del OTRO modo (ej: entrar a "Apuntar nueva antena" dejaba
    // "Cambiar de satélite" sin ninguna pestaña activa, rompiendo el ajuste en vivo).
    function switchTab(name, btnEl) {
      const btn = btnEl || document.querySelector(`.tab-btn[data-tab="${name}"]`);
      if (!btn) return;
      const scope = btn.closest('#modeChangeSat, #modeNewAntenna') || document;
      scope.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      scope.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
      // La pestaña de brújula normal necesita el sensor de orientación activo.
      // Pedimos permiso (si hace falta, iOS) en el mismo click que abre la pestaña,
      // porque el permiso solo se puede pedir a partir de un gesto del usuario.
      if (name === 'brujula' || name === 'inclinometroNueva') {
        requestCompassPermission();
      }
      // Los mapas de Leaflet se inicializan a veces con el panel oculto (display:none),
      // así que al volver a mostrar su pestaña les pedimos que recalculen el tamaño.
      if (name === 'calc' && map) {
        setTimeout(() => map.invalidateSize(), 50);
      }
      if (name === 'ubicacion' && map2) {
        setTimeout(() => map2.invalidateSize(), 50);
      }
    }
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });

    // ---------- Selección de modo ----------
    function showMode(mode) {
      document.getElementById('modeSelect').style.display = 'none';
      document.getElementById('modeChangeSat').style.display = mode === 'change' ? 'block' : 'none';
      document.getElementById('modeNewAntenna').style.display = mode === 'new' ? 'block' : 'none';
    }
    function backToModeSelect() {
      document.getElementById('modeSelect').style.display = 'block';
      document.getElementById('modeChangeSat').style.display = 'none';
      document.getElementById('modeNewAntenna').style.display = 'none';
    }
    document.getElementById('modeNewBtn').addEventListener('click', () => showMode('new'));
    document.getElementById('modeChangeBtn').addEventListener('click', () => showMode('change'));
    document.getElementById('backBtnChange').addEventListener('click', backToModeSelect);
    document.getElementById('backBtnNew').addEventListener('click', backToModeSelect);

    function verPDF() {
      window.open("SES_10.pdf", "_blank");
    }

    function descargarPDF() {
      const link = document.createElement("a");
      link.href = "SES_10.pdf";
      link.download = "SES_10.pdf";
      link.click();
    }

    // ---------- Mapa (Leaflet + OpenStreetMap) ----------
    let map, marker, azLine;
    let mapInitialized = false;

    function initMapIfNeeded() {
      if (mapInitialized) return;
      const siteMapEl = document.getElementById('siteMap');
      if (siteMapEl && siteMapEl.clientHeight === 0) {
        siteMapEl.style.height = '210px';
      }
      map = L.map('siteMap', { zoomControl: true }).setView([-31.4, -64.2], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18
      }).addTo(map);
      marker = L.marker([-31.4, -64.2], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(5);
        document.getElementById('lon').value = pos.lng.toFixed(5);
        calcular(pos.lat, pos.lng);
      });
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        document.getElementById('lat').value = e.latlng.lat.toFixed(5);
        document.getElementById('lon').value = e.latlng.lng.toFixed(5);
        calcular(e.latlng.lat, e.latlng.lng);
      });
      mapInitialized = true;
      setTimeout(() => map.invalidateSize(), 200);
    }

    // Punto destino dado un origen, un rumbo (grados) y una distancia (km) — solo para dibujar la línea de azimut.
    function destPoint(lat, lon, bearingDeg, distKm) {
      const R = 6371;
      const brng = bearingDeg * Math.PI / 180;
      const lat1 = lat * Math.PI / 180, lon1 = lon * Math.PI / 180;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distKm / R) + Math.cos(lat1) * Math.sin(distKm / R) * Math.cos(brng));
      const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distKm / R) * Math.cos(lat1), Math.cos(distKm / R) - Math.sin(lat1) * Math.sin(lat2));
      return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
    }

    function updateMap(lat, lon, azDestino) {
      document.getElementById('mapPanel').style.display = 'block';
      initMapIfNeeded();
      marker.setLatLng([lat, lon]);
      map.setView([lat, lon], 13);
      const end = destPoint(lat, lon, azDestino, 5);
      if (azLine) map.removeLayer(azLine);
      azLine = L.polyline([[lat, lon], end], { color: '#4fd1a5', weight: 4, dashArray: '6 6' }).addTo(map);
      setTimeout(() => map.invalidateSize(), 150);
    }

    function pointing(lat, lon, satLon) {
      const Re = 6378, Rs = 42164;
      const toRad = d => d * Math.PI / 180;
      const latR = toRad(lat), lonR = toRad(lon), satR = toRad(satLon);

      const Xo = Re * Math.cos(latR) * Math.cos(lonR);
      const Yo = Re * Math.cos(latR) * Math.sin(lonR);
      const Zo = Re * Math.sin(latR);

      const Xs = Rs * Math.cos(satR);
      const Ys = Rs * Math.sin(satR);
      const Zs = 0;

      const Dx = Xs - Xo, Dy = Ys - Yo, Dz = Zs - Zo;

      const east = [-Math.sin(lonR), Math.cos(lonR), 0];
      const north = [-Math.sin(latR) * Math.cos(lonR), -Math.sin(latR) * Math.sin(lonR), Math.cos(latR)];
      const up = [Math.cos(latR) * Math.cos(lonR), Math.cos(latR) * Math.sin(lonR), Math.sin(latR)];

      const E = Dx * east[0] + Dy * east[1] + Dz * east[2];
      const N = Dx * north[0] + Dy * north[1] + Dz * north[2];
      const U = Dx * up[0] + Dy * up[1] + Dz * up[2];

      let az = Math.atan2(E, N) * 180 / Math.PI;
      if (az < 0) az += 360;
      const el = Math.atan2(U, Math.sqrt(E * E + N * N)) * 180 / Math.PI;

      return { az, el };
    }

    function calcular(lat, lon) {
      const status = document.getElementById('status');
      const results = document.getElementById('results');
      const sesDataCard = document.getElementById('sesDataCard');

      const origen = pointing(lat, lon, SAT_ORIGEN);
      const destino = pointing(lat, lon, SAT_DESTINO);

      if (origen.el < 5 || destino.el < 5) {
        status.textContent = 'Con esta ubicación, uno de los dos satélites está muy bajo o fuera de vista.';
      } else {
        status.textContent = '';
      }

      let diffAz = destino.az - origen.az;
      if (diffAz > 180) diffAz -= 360;
      if (diffAz < -180) diffAz += 360;

      const diffEl = destino.el - origen.el;

      document.getElementById('azVal').textContent = Math.abs(diffAz).toFixed(1) + '°';
      document.getElementById('azDir').textContent = diffAz < 0 ? '← Izquierda' : 'Derecha →';

      document.getElementById('elVal').textContent = Math.abs(diffEl).toFixed(2) + '°';
      document.getElementById('elDir').textContent = diffEl >= 0 ? '↑ Subir' : '↓ Bajar';

      document.getElementById('sesAz').textContent = destino.az.toFixed(1) + "°";
      document.getElementById('sesEl').textContent = destino.el.toFixed(2) + "°";

      results.style.display = 'block';
      sesDataCard.style.display = 'block';
      updateMap(lat, lon, destino.az);

      targetDiff = diffAz;
      const dirTxt = diffAz < 0 ? 'a la izquierda' : 'a la derecha';
      document.getElementById('liveTarget').innerHTML = `Objetivo: <b>${Math.abs(diffAz).toFixed(1)}°</b> ${dirTxt}`;

      targetElDiff = diffEl;
      const dirTxtEl = diffEl >= 0 ? 'subir' : 'bajar';
      document.getElementById('liveTargetEl').innerHTML = `Objetivo: <b>${Math.abs(diffEl).toFixed(2)}°</b> ${dirTxtEl}`;

      resetLive();
      verificarBrujula();
    }

    document.getElementById('locBtn').addEventListener('click', () => {
      const status = document.getElementById('status');
      if (!navigator.geolocation) {
        status.textContent = 'Este navegador no permite obtener la ubicación. Usá "Ingresar coordenadas manualmente".';
        return;
      }
      status.textContent = 'Obteniendo ubicación...';
      navigator.geolocation.getCurrentPosition(
        pos => {
          document.getElementById('lat').value = pos.coords.latitude.toFixed(5);
          document.getElementById('lon').value = pos.coords.longitude.toFixed(5);
          status.textContent = '';
          calcular(pos.coords.latitude, pos.coords.longitude);
        },
        err => {
          // err.code: 1 = permiso denegado, 2 = posición no disponible, 3 = timeout
          let msg;
          switch (err.code) {
            case 1:
              msg = 'Permiso de ubicación denegado. Habilitalo en el ícono del candado/sitio, junto a la barra de direcciones.';
              break;
            case 2:
              msg = 'No se pudo determinar la posición (sin GPS/Wi-Fi con datos de ubicación, o "Ubicación" desactivada en el sistema operativo).';
              break;
            case 3:
              msg = 'Se agotó el tiempo esperando la ubicación. Probá de nuevo o ingresá las coordenadas manualmente.';
              break;
            default:
              msg = 'No se pudo obtener la ubicación.';
          }
          status.textContent = msg + ' Usá "Ingresar coordenadas manualmente" mientras tanto.';
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });

    document.getElementById('calcBtn').addEventListener('click', () => {
      const lat = parseFloat(document.getElementById('lat').value);
      const lon = parseFloat(document.getElementById('lon').value);
      const status = document.getElementById('status');
      if (isNaN(lat) || isNaN(lon)) {
        status.textContent = 'Ingresá latitud y longitud válidas.';
        return;
      }
      status.textContent = '';
      calcular(lat, lon);
    });

    // --- Ajuste en vivo: marca la posición actual y mide cuánto se giró desde ahí ---
    let targetDiff = null;   // grados objetivo, con signo (negativo = izquierda)
    let startHeading = null; // referencia tomada al tocar "Marcar"
    let capturing = false;   // esperando la primera lectura del sensor tras marcar
    let listening = false;   // ya hay un listener de orientación activo
    let motionListening = false; // ya hay un listener de devicemotion activo (para giroscopio)
    let reached = false;

    // --- Inclinómetro (elevación), modo Cambiar de satélite ---
    let targetElDiff = null;  // grados de elevación objetivo, con signo (negativo = bajar)
    let startTiltEl = null;   // referencia de inclinación tomada al tocar "Marcar"
    let reachedEl = false;
    let tiltDetectado = false; // llegó al menos una lectura con e.beta utilizable

    function resetLive() {
      startHeading = null;
      capturing = false;
      reached = false;
      document.getElementById('liveBox').style.display = 'none';
      document.getElementById('markBtn').textContent = '📍 Marcar acá = Intelsat 23';
      document.getElementById('markBtn').classList.remove('marked');

      startTiltEl = null;
      reachedEl = false;
      document.getElementById('liveBoxEl').style.display = 'none';
    }

    function rawHeading(e) {
      if (typeof e.webkitCompassHeading === 'number') return e.webkitCompassHeading;
      if (e.alpha !== null && e.alpha !== undefined) return (360 - e.alpha) % 360;
      return null;
    }

    function normalize180(deg) {
      return ((deg + 540) % 360) - 180;
    }

    // ---------- Detección de sensores ----------
    // IMPORTANTE: el evento 'deviceorientation' (heading/brújula) se calcula
    // combinando acelerómetro + magnetómetro. Que llegue este evento NO implica
    // que el teléfono tenga giroscopio físico. El giroscopio solo se puede
    // confirmar con 'devicemotion' -> rotationRate, que llega en null cuando
    // el dispositivo no tiene ese sensor (por eso antes marcaba los 3 en verde
    // aunque el teléfono no tuviera giroscopio real).
    function handleOrientation(e) {
      const heading = rawHeading(e);
      if (heading === null) return;
      sensorDetectado = true;
      lastRawHeading = heading;
      lastSensorEventTime = Date.now();
      updateCompassRose(heading);

      // Si el mensaje de "sin brújula" quedó mostrado por error (falso negativo previo),
      // lo ocultamos apenas confirmamos que sí llegan datos reales.
      document.getElementById('noCompass').style.display = 'none';
      document.getElementById('markBtn').style.display = 'block';

      // Este evento confirma acelerómetro + magnetómetro (son los que arman el heading).
      // El giroscopio se confirma aparte, en handleMotion().
      document.getElementById('dotAccel').classList.add('active');
      document.getElementById('dotMag').classList.add('active');
      document.getElementById('sensorHeading').textContent = Math.round(heading) + '°';

      // Inclinación (elevación) y giro lateral (nivel), para el inclinómetro
      // de 2 ejes. No todos los dispositivos entregan beta/gamma, así que se
      // tratan como opcionales en todo momento.
      const tilt = (typeof e.beta === 'number') ? e.beta : null;
      const roll = (typeof e.gamma === 'number') ? e.gamma : null;
      if (roll !== null) lastGammaDeg = roll;

      if (tilt !== null) {
        tiltDetectado = true;
        document.getElementById('noTilt').style.display = 'none';
        updateInclinometerNew(tilt, roll);
      }

      if (capturing) {
        startHeading = heading;
        startTiltEl = tilt;
        capturing = false;
        document.getElementById('liveBox').style.display = 'block';
        document.getElementById('liveStatus').textContent = 'Listo, ahora mové el plato';
        document.getElementById('liveStatus').style.color = '#8a96ab';
        if (tilt !== null) {
          document.getElementById('liveBoxEl').style.display = 'block';
          document.getElementById('liveStatusEl').textContent = 'Listo, ahora mové la elevación';
          document.getElementById('liveStatusEl').style.color = '#8a96ab';
        }
        return;
      }
      if (startHeading === null || targetDiff === null) return;

      const moved = normalize180(heading - startHeading); // cuánto se giró, con signo
      const remaining = targetDiff - moved;                // lo que falta para llegar al objetivo

      const movedEl = document.getElementById('liveMoved');
      const barEl = document.getElementById('liveBar');
      const statusEl = document.getElementById('liveStatus');

      movedEl.textContent = Math.abs(moved).toFixed(1) + '° ' + (moved < 0 ? '← izq.' : moved > 0 ? 'der. →' : '');

      const pct = targetDiff !== 0 ? Math.max(0, Math.min(100, (moved / targetDiff) * 100)) : 0;
      barEl.style.width = pct + '%';

      if (Math.abs(remaining) < 2) {
        barEl.style.background = '#4fd1a5';
        statusEl.textContent = '✅ ¡Llegaste! Ahí está SES-10';
        statusEl.style.color = '#4fd1a5';
        if (!reached) {
          reached = true;
          if (navigator.vibrate) navigator.vibrate(200);
        }
      } else {
        reached = false;
        barEl.style.background = '#ff9f5a';
        const dir = remaining < 0 ? 'izquierda' : 'derecha';
        statusEl.textContent = `Faltan ${Math.abs(remaining).toFixed(0)}° más a la ${dir}`;
        statusEl.style.color = '#8a96ab';
      }

      // --- Inclinómetro en vivo (burbuja de 2 ejes), misma lógica que el azimut ---
      if (startTiltEl !== null && targetElDiff !== null && tilt !== null) {
        // El celular apoyado contra el plato: al SUBIR la elevación, beta disminuye.
        const movedElAmount = startTiltEl - tilt;      // + = subió, - = bajó
        const remainingEl = targetElDiff - movedElAmount;

        const movedElText = document.getElementById('liveMovedEl');
        const statusElEl = document.getElementById('liveStatusEl');

        movedElText.textContent = Math.abs(movedElAmount).toFixed(1) + '° ' +
          (movedElAmount < 0 ? '↓ bajó' : movedElAmount > 0 ? '↑ subió' : '');

        updateBubble('Live', remainingEl, roll !== null ? roll : lastGammaDeg, true);

        if (Math.abs(remainingEl) < 1) {
          statusElEl.textContent = '✅ ¡Llegaste a la elevación de SES-10!';
          statusElEl.style.color = '#4fd1a5';
          if (!reachedEl) {
            reachedEl = true;
            if (navigator.vibrate) navigator.vibrate(200);
          }
        } else {
          reachedEl = false;
          if (remainingEl < 0) {
            statusElEl.textContent = '↓ Bajá el plato';
          } else {
            statusElEl.textContent = `Faltan ${Math.abs(remainingEl).toFixed(1)}° más para subir`;
          }
          statusElEl.style.color = '#8a96ab';
        }
      } else if (roll !== null) {
        // Todavía no se marcó una referencia (o no hay lectura de inclinación):
        // igual mostramos el nivel lateral en la burbuja, solo en el eje izq/der.
        updateBubble('Live', 0, roll, false);
      }
    }

    // Confirma el giroscopio físico a partir de devicemotion.rotationRate.
    // Si el navegador nunca entrega valores reales ahí, el punto se queda
    // apagado — igual que la página nativa de "Sensores" del teléfono.
    function handleMotion(e) {
      const rr = e.rotationRate;
      if (rr && (rr.alpha !== null || rr.beta !== null || rr.gamma !== null)) {
        document.getElementById('dotGyro').classList.add('active');
      }
    }

    function ensureListening() {
      if (!listening) {
        if ('ondeviceorientationabsolute' in window) {
          window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        } else {
          window.addEventListener('deviceorientation', handleOrientation, true);
        }
        listening = true;
      }
      ensureMotionListening();
    }

    function ensureMotionListening() {
      if (motionListening) return;
      if (!('DeviceMotionEvent' in window)) return;
      window.addEventListener('devicemotion', handleMotion, true);
      motionListening = true;
    }

    // Pide permiso de orientación/movimiento (iOS) y arranca los listeners.
    // Se llama desde el click que abre la pestaña "Brújula" del modo nueva antena,
    // así el permiso se pide dentro de un gesto real del usuario.
    function requestCompassPermission() {
      const noCompass2 = document.getElementById('noCompass2');
      if (!("DeviceOrientationEvent" in window)) {
        noCompass2.style.display = 'block';
        return;
      }
      const necesitaPermiso = typeof DeviceOrientationEvent.requestPermission === 'function';
      if (necesitaPermiso) {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
              DeviceMotionEvent.requestPermission().catch(() => {});
            }
            noCompass2.style.display = 'none';
            ensureListening();
            checkTiltNew();
          } else {
            noCompass2.textContent = '❌ Permiso denegado. Activalo desde los ajustes del navegador (Configuración → Safari → Acceso a Movimiento y Orientación).';
            noCompass2.style.display = 'block';
          }
        }).catch(() => {
          noCompass2.textContent = '❌ No se pudo pedir permiso de sensores en este navegador.';
          noCompass2.style.display = 'block';
        });
      } else {
        noCompass2.style.display = 'none';
        ensureListening();
        checkTiltNew();
      }
    }

    // Chequea si llegan lecturas de inclinación (e.beta) para el modo "Apuntar nueva antena".
    function checkTiltNew() {
      tiltDetectado = false;
      setTimeout(() => {
        if (!tiltDetectado) {
          document.getElementById('noTilt2').style.display = 'block';
        }
      }, 2000);
    }

    // Inclinómetro absoluto (modo Apuntar nueva antena): muestra la elevación estimada
    // del plato, el nivel lateral, y cuánto falta para llegar a la de SES-10.
    function updateInclinometerNew(betaDeg, gammaDeg) {
      const headingText = document.getElementById('tiltHeadingText');
      if (!headingText) return;

      // El celular apoyado plano contra la cara del plato: 90° = horizonte, 0° = cenit.
      const elCurrent = 90 - betaDeg;
      headingText.textContent = elCurrent.toFixed(1) + '°';
      document.getElementById('noTilt2').style.display = 'none';

      const statusEl = document.getElementById('tiltStatusNew');
      const hasTarget = targetElNew !== null;
      const diff = hasTarget ? (targetElNew - elCurrent) : 0; // + = falta subir, - = falta bajar

      updateBubble('New', diff, gammaDeg !== null ? gammaDeg : lastGammaDeg, hasTarget);

      if (!hasTarget) {
        statusEl.textContent = '';
        return;
      }

      const remainingAbs = Math.abs(diff);

      document.getElementById('tiltTargetNote').innerHTML =
        `SES-10 está a <b>${targetElNew.toFixed(2)}°</b> de elevación desde este punto.`;

      if (remainingAbs < 1) {
        statusEl.textContent = '✅ ¡Llegaste a la elevación de SES-10!';
        statusEl.style.color = '#4fd1a5';
      } else if (diff > 0) {
        statusEl.textContent = `Faltan ${remainingAbs.toFixed(1)}° más para subir`;
        statusEl.style.color = '#8a96ab';
      } else {
        statusEl.textContent = '↓ Bajá el plato';
        statusEl.style.color = '#8a96ab';
      }
    }

    // ---------- Inclinómetro de burbuja en 3D (2 ejes: elevación + nivel lateral) ----------
    // Reemplaza a las barras/textos sueltos de antes por un único indicador tipo
    // "burbuja de nivel": una bolita con look 3D (degradé + sombra) que se corre
    // dentro de un círculo. El eje vertical (arriba/abajo) marca cuánto falta subir
    // o bajar en elevación; el eje horizontal (izq/der) marca si el plato está
    // torcido hacia un costado. Cuando ambos ejes están dentro de tolerancia, la
    // bolita se pone verde.
    let lastGammaDeg = null;

    function buildBubbleSvg(suffix) {
      return `
        <svg viewBox="0 0 200 200" class="bubble-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="trackGrad${suffix}" cx="50%" cy="38%" r="75%">
              <stop offset="0%" stop-color="#182338"/>
              <stop offset="100%" stop-color="#080c16"/>
            </radialGradient>
            <radialGradient id="ballGood${suffix}" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#eafff6"/>
              <stop offset="45%" stop-color="#6fe0b8"/>
              <stop offset="100%" stop-color="#1c8a67"/>
            </radialGradient>
            <radialGradient id="ballWarn${suffix}" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#fff3e6"/>
              <stop offset="45%" stop-color="#ffb066"/>
              <stop offset="100%" stop-color="#c9601a"/>
            </radialGradient>
            <filter id="ballShadow${suffix}" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#000" flood-opacity="0.55"/>
            </filter>
          </defs>

          <circle cx="100" cy="100" r="92" fill="url(#trackGrad${suffix})" stroke="#25334d" stroke-width="2"></circle>
          <circle cx="100" cy="100" r="62" fill="none" stroke="#1a2540" stroke-width="1" stroke-dasharray="3 5"></circle>
          <circle cx="100" cy="100" r="30" fill="none" stroke="#324062" stroke-width="1.5" stroke-dasharray="2 3"></circle>
          <line x1="100" y1="12" x2="100" y2="188" stroke="#1a2540" stroke-width="1"></line>
          <line x1="12" y1="100" x2="188" y2="100" stroke="#1a2540" stroke-width="1"></line>

          <text x="100" y="21" text-anchor="middle" font-size="9.5" fill="#8a96ab" font-family="sans-serif" font-weight="700">ARRIBA</text>
          <text x="100" y="193" text-anchor="middle" font-size="9.5" fill="#8a96ab" font-family="sans-serif" font-weight="700">ABAJO</text>
          <text x="24" y="104" text-anchor="middle" font-size="9.5" fill="#8a96ab" font-family="sans-serif" font-weight="700">IZQ</text>
          <text x="176" y="104" text-anchor="middle" font-size="9.5" fill="#8a96ab" font-family="sans-serif" font-weight="700">DER</text>

          <g id="bubbleBall${suffix}" class="bubble-ball" filter="url(#ballShadow${suffix})">
            <circle id="bubbleFill${suffix}" cx="100" cy="100" r="15" fill="url(#ballWarn${suffix})" stroke="#0a0f1c" stroke-width="1"></circle>
            <ellipse cx="95" cy="94" rx="4.5" ry="2.8" fill="#ffffff" opacity="0.75"></ellipse>
          </g>
        </svg>
      `;
    }

    (function initBubbles() {
      const wrapNew = document.getElementById('bubbleWrapNew');
      const wrapLive = document.getElementById('bubbleWrapLive');
      if (wrapNew) wrapNew.innerHTML = buildBubbleSvg('New');
      if (wrapLive) wrapLive.innerHTML = buildBubbleSvg('Live');
    })();

    // elevDiffDeg: grados que faltan en elevación (+ = falta subir, - = falta bajar).
    // gammaDeg: inclinación lateral actual del celular (+ = hacia la derecha).
    // hasElevAxis: si hay un objetivo de elevación calculado; si no, la bolita
    // solo se mueve en el eje izquierda/derecha.
    function updateBubble(suffix, elevDiffDeg, gammaDeg, hasElevAxis) {
      const ball = document.getElementById('bubbleBall' + suffix);
      const fill = document.getElementById('bubbleFill' + suffix);
      if (!ball) return;

      const maxDeg = 8;  // grados de desvío que llevan la bolita al borde del círculo
      const maxPx = 62;  // radio máximo de desplazamiento dentro del círculo

      const g = (typeof gammaDeg === 'number') ? gammaDeg : 0;
      const clampedGamma = Math.max(-maxDeg, Math.min(maxDeg, g));
      const dx = (clampedGamma / maxDeg) * maxPx;

      let dy = 0;
      if (hasElevAxis) {
        const clampedElev = Math.max(-maxDeg, Math.min(maxDeg, elevDiffDeg));
        dy = (clampedElev / maxDeg) * maxPx;
      }

      ball.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);

      const onTargetLateral = Math.abs(g) < 2;
      const onTargetElev = !hasElevAxis || Math.abs(elevDiffDeg) < 1;
      if (fill) {
        fill.setAttribute('fill', `url(#${(onTargetLateral && onTargetElev) ? 'ballGood' : 'ballWarn'}${suffix})`);
      }

      const gammaText = document.getElementById('tiltGammaText' + suffix);
      if (gammaText) {
        gammaText.textContent = g.toFixed(1) + '°';
        gammaText.style.color = onTargetLateral ? '#4fd1a5' : '#e8edf7';
      }
    }

    // ---------- ¿Está leyendo bien? Chequeo de "sensor vivo" ----------
    // No hay forma 100% segura de saber, solo con software, si los GRADOS que
    // reporta el sensor son correctos (para eso hace falta una referencia física,
    // ver nota más abajo). Pero sí podemos detectar un caso muy común y molesto:
    // que el navegador haya dejado de mandar eventos 'deviceorientation' (pantalla
    // bloqueada, pestaña en segundo plano, o el sensor colgado). Si pasa mucho
    // tiempo sin una lectura nueva, avisamos.
    let lastSensorEventTime = null;

    function tickSensorHealth() {
      const healthNew = document.getElementById('tiltHealthNew');
      const healthLive = document.getElementById('tiltHealthLive');
      if (!healthNew && !healthLive) return;
      if (!listening || lastSensorEventTime === null) return;

      const elapsedMs = Date.now() - lastSensorEventTime;
      let msg, color;
      if (elapsedMs > 2500) {
        msg = `⚠ Sin lecturas nuevas hace ${(elapsedMs / 1000).toFixed(0)}s. Probá mover el celular; si no cambia nada, cerrá y volvé a abrir la pestaña.`;
        color = '#ff9f5a';
      } else {
        msg = '🟢 Sensor enviando datos con normalidad';
        color = '#4fd1a5';
      }
      if (healthNew) { healthNew.textContent = msg; healthNew.style.color = color; }
      if (healthLive) { healthLive.textContent = msg; healthLive.style.color = color; }
    }
    setInterval(tickSensorHealth, 1000);

    // Chequea si hay brújula disponible. En iOS (donde hace falta pedir permiso con
    // un gesto del usuario) NO podemos detectarlo automáticamente: dejamos el botón
    // visible y el chequeo real se hace después de que el usuario toca "Marcar".
    function verificarBrujula() {
      const markBtn = document.getElementById("markBtn");
      const noCompass = document.getElementById("noCompass");

      if (!("DeviceOrientationEvent" in window)) {
        markBtn.style.display = "none";
        noCompass.style.display = "block";
        return;
      }

      markBtn.style.display = "block";
      noCompass.style.display = "none";

      const necesitaPermiso = typeof DeviceOrientationEvent.requestPermission === 'function';
      if (necesitaPermiso) {
        // No hay forma de chequear sin gesto del usuario; se valida al tocar "Marcar".
        return;
      }

      sensorDetectado = false;
      tiltDetectado = false;
      ensureListening();
      setTimeout(() => {
        if (!sensorDetectado) {
          markBtn.style.display = "none";
          noCompass.style.display = "block";
        }
        if (!tiltDetectado) {
          document.getElementById('noTilt').style.display = 'block';
        }
      }, 2000);
    }

    document.getElementById('markBtn').addEventListener('click', () => {
      const liveTarget = document.getElementById('liveTarget');
      const noCompass = document.getElementById('noCompass');
      const markBtn = document.getElementById('markBtn');

      const startMark = () => {
        ensureListening();
        capturing = true; // la próxima lectura del sensor queda como referencia (0°)
        markBtn.textContent = '🔄 Volver a marcar acá';
        markBtn.classList.add('marked');
        noCompass.style.display = 'none';

        // Verificación real post-permiso: si en 2s no llegó ninguna lectura, no hay sensor.
        sensorDetectado = false;
        tiltDetectado = false;
        setTimeout(() => {
          if (!sensorDetectado) {
            markBtn.style.display = 'none';
            document.getElementById('liveBox').style.display = 'none';
            noCompass.textContent = '❌ Este dispositivo no tiene brújula o no está enviando datos de orientación.';
            noCompass.style.display = 'block';
          }
          if (!tiltDetectado) {
            document.getElementById('noTilt').style.display = 'block';
          }
        }, 2000);
      };

      // En iOS, DeviceMotionEvent (acelerómetro/giroscopio crudo) pide permiso
      // por separado de DeviceOrientationEvent (brújula). Pedimos los dos con
      // el mismo gesto del usuario para que el punto del giroscopio también
      // pueda encenderse si el hardware lo tiene.
      const pedirPermisoMotion = () => {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          DeviceMotionEvent.requestPermission().catch(() => {});
        }
      };

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') {
            pedirPermisoMotion();
            startMark();
          } else {
            noCompass.textContent = '❌ Permiso denegado. Activalo desde los ajustes del navegador (Configuración → Safari → Acceso a Movimiento y Orientación).';
            noCompass.style.display = 'block';
          }
        }).catch(() => {
          noCompass.textContent = '❌ No se pudo pedir permiso de sensores en este navegador.';
          noCompass.style.display = 'block';
        });
      } else if (window.DeviceOrientationEvent) {
        pedirPermisoMotion();
        startMark();
      } else {
        noCompass.textContent = '❌ Este navegador no tiene sensor de orientación disponible.';
        noCompass.style.display = 'block';
      }
    });

    // ================================================================
    // ============ MODO: APUNTAR NUEVA ANTENA (brújula normal) ========
    // ================================================================

    let lastRawHeading = null;   // último heading crudo recibido del sensor
    let northOffset = 0;         // corrección manual si la brújula está desviada
    let targetAzNew = null;      // azimut de SES-10 desde el punto calculado
    let targetElNew = null;      // elevación de SES-10 desde el punto calculado

    // Rotación acumulada (sin normalizar) del dial de la brújula. La usamos en vez
    // de fijar siempre el ángulo 0-360°, para evitar que al cruzar el Norte (ej:
    // 359° -> 1°) la transición CSS anime la vuelta larga (358°) en lugar del
    // giro real y corto (2°). Puede crecer o decrecer sin límite (720°, -40°, etc.),
    // el resultado visual es el mismo.
    let compassRotation = 0;
    let compassRotationInit = false;

    function normalize360(deg) {
      return ((deg % 360) + 360) % 360;
    }

    function azToCardinal(deg) {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
      const idx = Math.round(normalize360(deg) / 45) % 8;
      return dirs[idx];
    }

    // ---------- Mapa 2 (para "Ubicación" del modo nueva antena) ----------
    let map2, marker2, azLine2;
    let map2Initialized = false;

    function initMap2IfNeeded() {
      if (map2Initialized) return;
      // Respaldo por si el CSS (styles.css) todavía no tiene el alto de #siteMap2
      // -por ejemplo, cache del navegador con una versión vieja del archivo-:
      // sin alto, Leaflet inicializa el mapa en un contenedor de 0px y no se ve nada.
      const siteMap2El = document.getElementById('siteMap2');
      if (siteMap2El && siteMap2El.clientHeight === 0) {
        siteMap2El.style.height = '210px';
      }
      map2 = L.map('siteMap2', { zoomControl: true }).setView([-31.4, -64.2], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18
      }).addTo(map2);
      marker2 = L.marker([-31.4, -64.2], { draggable: true }).addTo(map2);
      marker2.on('dragend', () => {
        const pos = marker2.getLatLng();
        document.getElementById('lat2').value = pos.lat.toFixed(5);
        document.getElementById('lon2').value = pos.lng.toFixed(5);
        calcularNuevaAntena(pos.lat, pos.lng);
      });
      map2.on('click', (e) => {
        marker2.setLatLng(e.latlng);
        document.getElementById('lat2').value = e.latlng.lat.toFixed(5);
        document.getElementById('lon2').value = e.latlng.lng.toFixed(5);
        calcularNuevaAntena(e.latlng.lat, e.latlng.lng);
      });
      map2Initialized = true;
      setTimeout(() => map2.invalidateSize(), 200);
    }

    function updateMap2(lat, lon, az) {
      document.getElementById('mapPanel2').style.display = 'block';
      initMap2IfNeeded();
      marker2.setLatLng([lat, lon]);
      map2.setView([lat, lon], 13);
      const end = destPoint(lat, lon, az, 5);
      if (azLine2) map2.removeLayer(azLine2);
      azLine2 = L.polyline([[lat, lon], end], { color: '#4fd1a5', weight: 4, dashArray: '6 6' }).addTo(map2);
      setTimeout(() => map2.invalidateSize(), 150);
    }

    function calcularNuevaAntena(lat, lon) {
      const status2 = document.getElementById('status2');
      const destino = pointing(lat, lon, SAT_DESTINO);

      if (destino.el < 5) {
        status2.textContent = 'Con esta ubicación, SES-10 está muy bajo o fuera de vista.';
      } else {
        status2.textContent = '';
      }

      targetAzNew = destino.az;
      targetElNew = destino.el;

      document.getElementById('azVal2').textContent = destino.az.toFixed(1) + '°';
      document.getElementById('azDir2').textContent = azToCardinal(destino.az);
      document.getElementById('elVal2').textContent = destino.el.toFixed(2) + '°';
      document.getElementById('results2').style.display = 'block';

      updateMap2(lat, lon, destino.az);

      document.getElementById('compassTargetNote').innerHTML =
        `SES-10 está a <b>${destino.az.toFixed(1)}° (${azToCardinal(destino.az)})</b> y ` +
        `<b>${destino.el.toFixed(2)}°</b> de elevación desde este punto.`;

      const satMarkerGroup = document.getElementById('satMarkerGroup');
      if (satMarkerGroup) {
        satMarkerGroup.setAttribute('transform', `rotate(${targetAzNew} 120 120)`);
        satMarkerGroup.style.opacity = '1';
      }
    }

    document.getElementById('locBtn2').addEventListener('click', () => {
      const status2 = document.getElementById('status2');
      if (!navigator.geolocation) {
        status2.textContent = 'Este navegador no permite obtener la ubicación. Usá "Ingresar coordenadas manualmente".';
        return;
      }
      status2.textContent = 'Obteniendo ubicación...';
      navigator.geolocation.getCurrentPosition(
        pos => {
          document.getElementById('lat2').value = pos.coords.latitude.toFixed(5);
          document.getElementById('lon2').value = pos.coords.longitude.toFixed(5);
          status2.textContent = '';
          calcularNuevaAntena(pos.coords.latitude, pos.coords.longitude);
        },
        err => {
          let msg;
          switch (err.code) {
            case 1:
              msg = 'Permiso de ubicación denegado. Habilitalo en el ícono del candado/sitio, junto a la barra de direcciones.';
              break;
            case 2:
              msg = 'No se pudo determinar la posición (sin GPS/Wi-Fi con datos de ubicación, o "Ubicación" desactivada en el sistema operativo).';
              break;
            case 3:
              msg = 'Se agotó el tiempo esperando la ubicación. Probá de nuevo o ingresá las coordenadas manualmente.';
              break;
            default:
              msg = 'No se pudo obtener la ubicación.';
          }
          status2.textContent = msg + ' Usá "Ingresar coordenadas manualmente" mientras tanto.';
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });

    document.getElementById('calcBtn2').addEventListener('click', () => {
      const lat = parseFloat(document.getElementById('lat2').value);
      const lon = parseFloat(document.getElementById('lon2').value);
      const status2 = document.getElementById('status2');
      if (isNaN(lat) || isNaN(lon)) {
        status2.textContent = 'Ingresá latitud y longitud válidas.';
        return;
      }
      status2.textContent = '';
      calcularNuevaAntena(lat, lon);
    });

    // ---------- Brújula normal (rosa que gira + marcador de SES-10) ----------
    function updateCompassRose(rawHeadingDeg) {
      const dial = document.getElementById('compassDial');
      const headingText = document.getElementById('compassHeadingText');
      if (!dial || !headingText) return; // el DOM del modo nueva antena no está en esta página

      const adjHeading = normalize360(rawHeadingDeg - northOffset);
      headingText.textContent = Math.round(adjHeading) + '° (' + azToCardinal(adjHeading) + ')';

      // En vez de fijar rotate(-adjHeading) directo (0-360°), acumulamos tomando
      // siempre el delta más corto respecto a la rotación anterior. Así, al cruzar
      // el Norte, el dial gira solo lo que realmente se movió (unos pocos grados)
      // y no toda la vuelta larga que la transición CSS animaría si el valor
      // saltara de golpe de -359° a -1°.
      const targetRotation = normalize360(-adjHeading);
      if (!compassRotationInit) {
        compassRotation = targetRotation;
        compassRotationInit = true;
      } else {
        const current360 = normalize360(compassRotation);
        let delta = targetRotation - current360;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        compassRotation += delta;
      }
      dial.setAttribute('transform', `rotate(${compassRotation} 120 120)`);

      const noCompass2 = document.getElementById('noCompass2');
      if (noCompass2) noCompass2.style.display = 'none';
    }

    document.getElementById('setNorthBtn').addEventListener('click', () => {
      const note = document.getElementById('northOffsetNote');
      if (lastRawHeading === null) {
        note.textContent = 'Todavía no llegó ninguna lectura del sensor. Esperá un instante y probá de nuevo.';
        return;
      }
      northOffset = lastRawHeading;
      note.innerHTML = '✅ Norte seteado. <span id="resetNorthLink" style="text-decoration:underline;cursor:pointer">Restablecer</span>';
      document.getElementById('resetNorthLink').addEventListener('click', () => {
        northOffset = 0;
        note.textContent = 'Corrección de norte restablecida (usando la brújula del sensor tal cual).';
      });
    });

    // ---------- Pestaña "Manual" también en el modo Apuntar nueva antena ----------
    // Reutilizamos el mismo contenido del manual (ver/descargar PDF + activar Telnet y RF)
    // clonándolo por JS en lugar de duplicarlo en el HTML.
    (function cloneManualTab() {
      const src = document.getElementById('tab-manual');
      const dst = document.getElementById('tab-manualNueva');
      if (src && dst) dst.innerHTML = src.innerHTML;
    })();
