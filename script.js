    const SAT_ORIGEN = -53;   // Intelsat 23, 53° Oeste
    const SAT_DESTINO = -67;  // SES-10, 67° Oeste
    let sensorDetectado = false;

    // ---------- Tabs ----------
    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    }
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

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
      document.getElementById('sesMove').textContent =
        Math.abs(diffAz).toFixed(1) + (diffAz < 0 ? "° ← izquierda" : "° → derecha");

      results.style.display = 'block';
      sesDataCard.style.display = 'block';
      updateMap(lat, lon, destino.az);

      targetDiff = diffAz;
      const dirTxt = diffAz < 0 ? 'a la izquierda' : 'a la derecha';
      document.getElementById('liveTarget').innerHTML = `Objetivo: <b>${Math.abs(diffAz).toFixed(1)}°</b> ${dirTxt}`;
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
          status.textContent = 'No se pudo obtener la ubicación. Usá "Ingresar coordenadas manualmente".';
        }
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
    let reached = false;

    function resetLive() {
      startHeading = null;
      capturing = false;
      reached = false;
      document.getElementById('liveBox').style.display = 'none';
      document.getElementById('markBtn').textContent = '📍 Marcar acá = Intelsat 23';
      document.getElementById('markBtn').classList.remove('marked');
    }

    function rawHeading(e) {
      if (typeof e.webkitCompassHeading === 'number') return e.webkitCompassHeading;
      if (e.alpha !== null && e.alpha !== undefined) return (360 - e.alpha) % 360;
      return null;
    }

    function normalize180(deg) {
      return ((deg + 540) % 360) - 180;
    }

    function handleOrientation(e) {
      const heading = rawHeading(e);
      if (heading === null) return;
      sensorDetectado = true;

      // Si el mensaje de "sin brújula" quedó mostrado por error (falso negativo previo),
      // lo ocultamos apenas confirmamos que sí llegan datos reales.
      document.getElementById('noCompass').style.display = 'none';
      document.getElementById('markBtn').style.display = 'block';

      // Sensores activos: la app está recibiendo lecturas reales de orientación,
      // así que encendemos los tres indicadores y mostramos el heading en vivo.
      document.getElementById('dotAccel').classList.add('active');
      document.getElementById('dotMag').classList.add('active');
      document.getElementById('dotGyro').classList.add('active');
      document.getElementById('sensorHeading').textContent = Math.round(heading) + '°';

      if (capturing) {
        startHeading = heading;
        capturing = false;
        document.getElementById('liveBox').style.display = 'block';
        document.getElementById('liveStatus').textContent = 'Listo, ahora mové el plato';
        document.getElementById('liveStatus').style.color = '#8a96ab';
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
    }

    function ensureListening() {
      if (listening) return;
      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
      } else {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
      listening = true;
    }

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
      ensureListening();
      setTimeout(() => {
        if (sensorDetectado) return;
        markBtn.style.display = "none";
        noCompass.style.display = "block";
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
        setTimeout(() => {
          if (sensorDetectado) return;
          markBtn.style.display = 'none';
          document.getElementById('liveBox').style.display = 'none';
          noCompass.textContent = '❌ Este dispositivo no tiene brújula o no está enviando datos de orientación.';
          noCompass.style.display = 'block';
        }, 2000);
      };

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') {
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
        startMark();
      } else {
        noCompass.textContent = '❌ Este navegador no tiene sensor de orientación disponible.';
        noCompass.style.display = 'block';
      }
    });
