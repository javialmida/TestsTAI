// 1. CONFIGURACIÓN E INDICADORES DE ESTADO
const URL_SCRIPT = "https://script.google.com/macros/s/AKfycbwfB5sZE-q22Ha5uvvYM89wFyu74RfVyWM9k2ZA0sg7v9wGtNkCPVr1qM-iPY4UfmNd/exec";

let preguntasTest = [];
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

// 2. CARGA DEL MENÚ Y CIERRE DE BLOQUES
async function cargarMenuDinamico() {
    try {
        const res = await fetch(`${URL_SCRIPT}?accion=obtenerListaTests`);
        const tests = await res.json();
        
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });

        tests.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}"> <span>${t.nombreVisible}</span>`;
            
            const idSuperior = t.id.toUpperCase();

            if (idSuperior.startsWith("EX") || idSuperior.startsWith("SI")) {
                document.getElementById('lista-oficiales').appendChild(label);
            } else {
                const contenedor = document.getElementById(`lista-B${t.bloque}`);
                if (contenedor) contenedor.appendChild(label);
            }
        });

        document.querySelectorAll('details.bloque').forEach(d => {
            d.querySelector('summary').onclick = () => {
                document.querySelectorAll('details.bloque').forEach(other => {
                    if (other !== d) other.removeAttribute('open');
                });
            };
        });
    } catch (e) {
        console.error("Error al cargar menú:", e);
    }
}

// 3. BOTÓN COMENZAR (CON REFUERZO DE REDIRECCIÓN)
document.getElementById('btnComenzar').onclick = async () => {
    const seleccionado = document.querySelector('input[name="test-select"]:checked');
    if (!seleccionado) return alert("Por favor, selecciona un test antes de despegar 🚀");

    const btn = document.getElementById('btnComenzar');
    btn.textContent = "CARGANDO...";
    
    try {
        const timestamp = new Date().getTime();
        // Forzamos redirect 'follow' para que el navegador siga la respuesta de Google
        const res = await fetch(`${URL_SCRIPT}?idTest=${seleccionado.value}&t=${timestamp}`, {
            method: 'GET',
            redirect: 'follow'
        });
        
        preguntasTest = await res.json();
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';
        
        document.getElementById('pantalla-inicio').classList.add('hidden');
        document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
        mostrarPregunta();
    } catch (e) {
        console.error(e);
        alert("Error de conexión. Si acabas de actualizar el script en Google, espera 30 segundos y recarga.");
    } finally {
        btn.textContent = "COMENZAR TEST";
    }
};

// 4. LÓGICA DE PREGUNTAS
function mostrarPregunta() {
    const p = preguntasTest[preguntaActualIndex];
    esDudada = false;
    
    const btnDuda = document.getElementById('btnArriesgando');
    btnDuda.classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    
    const radioSeleccionado = document.querySelector('input[name="test-select"]:checked');
    const nombreDelMenu = radioSeleccionado ? radioSeleccionado.parentElement.textContent.trim() : "Test";
    const nombreTest = p.tituloTema || nombreDelMenu;
    
    document.getElementById('contador-preguntas').textContent = `${nombreTest} | Pregunta ${preguntaActualIndex + 1}/${preguntasTest.length}`;
    document.getElementById('enunciado').textContent = p.enunciado;
    
    const lista = document.getElementById('opciones-lista');
    lista.innerHTML = "";
    
    const btnAccion = document.getElementById('btnAccion');
    btnAccion.disabled = true;
    btnAccion.textContent = modoEstudio ? "CORREGIR" : "SIGUIENTE";

    ["a", "b", "c", "d"].forEach(letra => {
        const btn = document.createElement('button');
        btn.className = "opcion";
        btn.textContent = `${letra}) ${p.opciones[letra]}`; 
        btn.dataset.letra = letra; 

        btn.onclick = () => {
            document.querySelectorAll('.opcion').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            btnAccion.disabled = false;
            btnAccion.onclick = () => {
                p.tituloTema = nombreTest; 
                procesarRespuesta(letra);
            };
        };
        lista.appendChild(btn);
    });
}

// 5. BOTÓN ARRIESGANDO
document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};

// 6. CORRECCIÓN Y AVANCE
function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const correcta = p.correcta.toString().toLowerCase().trim();
    seleccionada = seleccionada.toString().toLowerCase().trim();

    p.tuRespuesta = seleccionada;
    p.tuRespuestaText = `${seleccionada}) ${p.opciones[seleccionada]}`; 
    p.fueDudada = esDudada; 

    if (esDudada) puntuacion.arriesgadas++;
    if (seleccionada === correcta) {
        puntuacion.aciertos++;
    } else {
        puntuacion.fallos++;
    }

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const letraBoton = btn.dataset.letra; 
            if (letraBoton === correcta) {
                btn.style.background = "#28a745"; 
                btn.style.borderColor = "#28a745";
            }
            if (letraBoton === seleccionada && seleccionada !== correcta) {
                btn.style.background = "#dc3545";
                btn.style.borderColor = "#dc3545";
            }
            btn.disabled = true; 
            btn.style.cursor = "default";
        });
        
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        
        const btnAccion = document.getElementById('btnAccion');
        btnAccion.textContent = "SIGUIENTE";
        btnAccion.onclick = () => siguiente();
    } else {
        siguiente();
    }
}

function siguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) {
        mostrarPregunta();
    } else {
        mostrarResumen();
    }
}

// 7. RESULTADOS Y ESTADÍSTICAS
function mostrarResumen() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');

    const total = preguntasTest.length;
    const porcentaje = total > 0 ? ((puntuacion.aciertos / total) * 100).toFixed(2) : 0;
    
    const contenedorStats = document.getElementById('contenedor-stats');
    contenedorStats.className = "resumen-stats";
    contenedorStats.innerHTML = `
        <div class="stat-card card-aciertos">
            <span>ACIERTOS</span><br>
            <span style="font-size: 1.5rem;">${puntuacion.aciertos}</span>
        </div>
        <div class="stat-card card-fallos">
            <span>FALLOS</span><br>
            <span style="font-size: 1.5rem;">${puntuacion.fallos}</span>
        </div>
        <div class="stat-card card-dudas">
            <span>DUDAS</span><br>
            <span style="font-size: 1.5rem;">${puntuacion.arriesgadas}</span>
        </div>
        <div class="contenedor-resultado-especial" style="width: 100%; flex-basis: 100%; margin-top: 15px;">
            <div class="caja-brillo-celeste">
                <span class="titulo-resultado">RESULTADO FINAL</span><br>
                <span class="porcentaje-celeste">${porcentaje}%</span>
            </div>
        </div>
    `;

    const informe = document.getElementById('contenedor-informe');
    informe.innerHTML = '<h3 style="color:#00d4ff; text-align:center; margin-top:30px;">REVISIÓN DE ERRORES Y DUDAS</h3>';
    
    let hayRevision = false;
    preguntasTest.forEach((p, index) => {
        const rUser = (p.tuRespuesta || "").toLowerCase();
        const rCorr = (p.correcta || "").toLowerCase();
        const esCorrecta = rUser === rCorr;
        if (esCorrecta && !p.fueDudada) return;

        hayRevision = true;
        const div = document.createElement('div');
        div.className = "item-revision";
        let icono = esCorrecta ? "⚠️" : "❌";
        let claseTitulo = esCorrecta ? "txt-duda" : "txt-fallo";
        let textoEstado = esCorrecta ? "ACERTADA (CON DUDAS)" : "FALLADA";

        div.innerHTML = `
            <p><strong>${index + 1}. ${p.enunciado}</strong></p>
            <p class="${claseTitulo}" style="font-weight:bold; margin-bottom: 5px;">${icono} ${textoEstado}</p>
            <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 5px;">
                <p style="margin: 5px 0;">👉 <strong>Tu respuesta:</strong> ${p.tuRespuestaText || "Sin respuesta"}</p>
                <p style="margin: 5px 0;" class="txt-correcta">✅ <strong>Correcta:</strong> ${p.opciones[rCorr] ? rCorr + ') ' + p.opciones[rCorr] : rCorr}</p>
            </div>
            ${p.feedback ? `<div class="box-feedback" style="margin-top:10px;"><strong>💡 Explicación:</strong> ${p.feedback}</div>` : ''}
        `;
        informe.appendChild(div);
    });

    if (!hayRevision) {
        informe.innerHTML += `<div class="box-impecable"><h3>¡IMPECABLE! 🏆</h3></div>`;
    }

    const contenedorBoton = document.getElementById('contenedor-boton-volver');
    contenedorBoton.innerHTML = `<button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>`;
    finalizar();
}

function finalizar() {
    const seleccionado = document.querySelector('input[name="test-select"]:checked');
    const idTest = seleccionado ? seleccionado.value : "SIN_ID"; 
    const totalPreguntas = preguntasTest.length;
    let notaPorcentaje = totalPreguntas > 0 ? ((puntuacion.aciertos / totalPreguntas) * 100).toFixed(2) : 0;

    const urlConDatos = `${URL_SCRIPT}?accion=guardar&test=${encodeURIComponent(idTest)}&aciertos=${puntuacion.aciertos}&fallos=${puntuacion.fallos}&dudas=${puntuacion.arriesgadas}&nota=${notaPorcentaje}`;

    fetch(urlConDatos, { mode: 'no-cors' })
        .then(() => console.log("Guardado"))
        .catch(err => console.error(err));
}

// 8. INTERFAZ Y NAVEGACIÓN
document.getElementById('btnSalir').onclick = () => {
    if (confirm("¿Abandonar test?")) location.reload();
};

async function mostrarEstadisticas() {
    document.getElementById('pantalla-inicio').classList.add('hidden');
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.add('hidden');
    const pantallaEst = document.getElementById('pantalla-estadisticas');
    pantallaEst.classList.remove('hidden');
    pantallaEst.innerHTML = '<h2 style="text-align:center; color:#9c4dcc;">CARGANDO TUS NOTAS...</h2>';

    try {
        const resp = await fetch(`${URL_SCRIPT}?accion=obtenerEstadisticas`);
        const temas = await resp.json();
        let html = '<h2 style="text-align:center; color:#9c4dcc;">RENDIMIENTO POR TEMAS</h2>';
        
        for (let idClave in temas) {
            const t = temas[idClave];
            const totalHistorico = t.aciertos + t.fallos; 
            const porcentaje = totalHistorico > 0 ? ((t.aciertos / totalHistorico) * 100).toFixed(1) : 0;
            const radioOriginal = document.querySelector(`input[value="${idClave}"]`);
            let nombreMostrar = radioOriginal ? radioOriginal.parentElement.textContent.trim() : idClave;

            html += `
                <div class="bloque-est-container">
                    <div class="info-bloque"><span>${nombreMostrar}</span><span>${porcentaje}%</span></div>
                    <div class="barra-fondo"><div class="barra-progreso-celeste" style="width: ${porcentaje}%"></div></div>
                    <p class="detalle-est">${t.aciertos} aciertos / ${t.fallos} fallos</p>
                </div>`;
        }
        html += '<button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>';
        pantallaEst.innerHTML = html;
    } catch (error) {
        pantallaEst.innerHTML = '<button class="btn-volver" onclick="location.reload()">VOLVER</button>';
    }
}

document.getElementById('btnEstadisticas').onclick = mostrarEstadisticas;
window.onload = cargarMenuDinamico;
