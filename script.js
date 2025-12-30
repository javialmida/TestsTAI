const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";

let preguntasTest = [];
let respuestasUsuario = []; 
let preguntaActualIndex = 0;
let puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
let modoEstudio = true;
let esDudada = false;

async function supabaseFetch(endpoint) {
    const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" }
    });
    return await res.json();
}

async function cargarMenuDinamico() {
    // Listener para acordeón exclusivo
    document.addEventListener("click", function(e) {
        if (e.target.tagName === "SUMMARY" && e.target.parentElement.classList.contains("bloque")) {
            const details = document.querySelectorAll("details.bloque");
            details.forEach(d => {
                if (d !== e.target.parentElement) {
                    d.removeAttribute("open");
                }
            });
        }
    });

    try {
        const data = await supabaseFetch("tests?select=*&visible=eq.true&order=id.asc");
        
        // Agrupar por bloques
        const bloques = {};
        data.forEach(test => {
            if (!bloques[test.bloque]) bloques[test.bloque] = [];
            bloques[test.bloque].push(test);
        });

        const acordeon = document.getElementById('acordeon-temas');
        acordeon.innerHTML = ""; // Limpiar loading

        for (const [bloqueId, tests] of Object.entries(bloques)) {
            // Creamos el details
            const details = document.createElement('details');
            details.className = 'bloque';
            
            // Nombre del bloque (Asumimos formato 'B1', 'B2' etc, mapeamos a texto si quieres, por ahora genérico)
            // Si en la BD tienes un nombre largo para el bloque, úsalo aquí. Usaremos "BLOQUE X" por defecto.
            const summary = document.createElement('summary');
            summary.innerText = `BLOQUE ${bloqueId}`;
            
            const divList = document.createElement('div');
            divList.className = 'test-list';

            tests.forEach(t => {
                const item = document.createElement('div');
                item.className = 'test-item';
                item.innerHTML = `
                    <input type="radio" name="test-select" value="${t.id}" id="t-${t.id}">
                    <label for="t-${t.id}">${t.titulo}</label>
                `;
                divList.appendChild(item);
            });

            details.appendChild(summary);
            details.appendChild(divList);
            acordeon.appendChild(details);
        }

    } catch (err) {
        console.error(err);
        document.getElementById('acordeon-temas').innerHTML = "<p>Error cargando tests.</p>";
    }
}

// Inicializar menú
cargarMenuDinamico();

// Lógica Botones y Test
document.getElementById('btnEstadisticas').onclick = () => {
    alert("Próximamente: Estadísticas detalladas");
};

document.getElementById('btnSalir').onclick = () => {
    if(confirm("¿Seguro que quieres salir? Perderás el progreso actual.")) {
        location.reload();
    }
};

document.getElementById('btnComenzar').onclick = async () => {
    const sel = document.querySelector('input[name="test-select"]:checked');
    if (!sel) return alert("Selecciona un test 🚀");
    
    // Capturar nombre del test para la cabecera
    const nombreTest = sel.nextElementSibling.innerText;
    document.getElementById('nombre-test-activo').innerText = nombreTest;

    const testId = sel.value;
    const modo = document.querySelector('input[name="modo"]:checked').value;
    modoEstudio = (modo === 'estudio');

    // UI
    document.querySelector('footer').classList.add('hidden');
    document.getElementById('pantalla-inicio').classList.add('hidden');
    document.querySelector('header').classList.add('hidden'); // Ocultar header principal si quieres, o dejarlo
    document.getElementById('pantalla-test').classList.remove('hidden');

    // Cargar preguntas
    const preguntas = await supabaseFetch(`preguntas?test_id=eq.${testId}`);
    // Mezclar preguntas (Fisher-Yates)
    preguntasTest = preguntas.sort(() => Math.random() - 0.5);
    
    preguntaActualIndex = 0;
    puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };
    respuestasUsuario = [];
    
    mostrarPregunta();
};

function mostrarPregunta() {
    const p = preguntasTest[preguntaActualIndex];
    document.getElementById('contador-preguntas').innerText = `Pregunta ${preguntaActualIndex + 1}/${preguntasTest.length}`;
    document.getElementById('pregunta-texto').innerText = p.pregunta;
    
    // Opciones
    const opts = ['a', 'b', 'c', 'd'];
    const container = document.getElementById('opciones-container');
    container.innerHTML = "";
    
    // Resetear estados
    esDudada = false;
    document.getElementById('feedback-area').classList.add('hidden');
    document.getElementById('btnAccion').disabled = true;
    document.getElementById('btnAccion').innerText = "CORREGIR";
    document.getElementById('btnArriesgando').classList.remove('hidden');

    opts.forEach(letra => {
        if (!p[`opcion_${letra}`]) return; // por si acaso alguna es null
        
        const div = document.createElement('div');
        div.className = 'opcion';
        div.dataset.letra = letra;
        div.innerText = `${letra.toUpperCase()}) ${p[`opcion_${letra}`]}`;
        
        div.onclick = () => seleccionarOpcion(div);
        container.appendChild(div);
    });
}

function seleccionarOpcion(div) {
    if (document.getElementById('btnAccion').innerText === "SIGUIENTE") return; // Ya corregido

    document.querySelectorAll('.opcion').forEach(o => o.classList.remove('selected'));
    div.classList.add('selected');
    document.getElementById('btnAccion').disabled = false;
}

document.getElementById('btnArriesgando').onclick = () => {
    esDudada = !esDudada;
    const btn = document.getElementById('btnArriesgando');
    if (esDudada) {
        btn.style.border = "2px solid white";
        btn.innerText = "DUDADA (MARCADA)";
    } else {
        btn.style.border = "none";
        btn.innerText = "¿DUDAS? (ARRIESGANDO)";
    }
};

document.getElementById('btnAccion').onclick = () => {
    const btn = document.getElementById('btnAccion');
    if (btn.innerText === "CORREGIR") {
        corregirPregunta();
    } else {
        siguientePregunta();
    }
};

function corregirPregunta() {
    const p = preguntasTest[preguntaActualIndex];
    const seleccionadaDiv = document.querySelector('.opcion.selected');
    const letraSeleccionada = seleccionadaDiv.dataset.letra;
    const esCorrecta = (letraSeleccionada === p.correcta);

    // Guardar respuesta
    respuestasUsuario.push({
        pregunta: p.pregunta,
        opciones: {
            a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d
        },
        seleccionada: letraSeleccionada,
        correcta: p.correcta,
        esCorrecta: esCorrecta,
        dudada: esDudada,
        feedback: p.explicacion
    });

    // Puntuación
    if (esCorrecta) {
        puntuacion.aciertos++;
        if (esDudada) puntuacion.arriesgadas++;
    } else {
        puntuacion.fallos++;
    }

    // Visual
    const opciones = document.querySelectorAll('.opcion');
    opciones.forEach(o => {
        o.style.pointerEvents = 'none'; // bloquear clicks
        if (o.dataset.letra === p.correcta) o.classList.add('correct');
        if (o.dataset.letra === letraSeleccionada && !esCorrecta) o.classList.add('incorrect');
    });

    // Feedback visual
    if (modoEstudio) {
        const fbArea = document.getElementById('feedback-area');
        document.getElementById('feedback-texto').innerText = p.explicacion || "Sin explicación disponible.";
        fbArea.classList.remove('hidden');
    }

    document.getElementById('btnArriesgando').classList.add('hidden');
    document.getElementById('btnAccion').innerText = "SIGUIENTE";
}

function siguientePregunta() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) {
        mostrarPregunta();
    } else {
        finalizarTest();
    }
}

function finalizarTest() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    
    const total = preguntasTest.length;
    // Nota calculada como (Aciertos / Total) * 10
    const nota = total > 0 ? ((puntuacion.aciertos / total) * 10).toFixed(2) : 0;

    // INYECCIÓN DE CÁPSULAS HORIZONTALES
    document.getElementById('contenedor-stats').innerHTML = `
        <div class="resumen-stats">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-dudas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <div class="caja-brillo-celeste">
            <div class="porcentaje-celeste">${nota}</div>
            <p class="label-nota-final">NOTA FINAL</p>
        </div>
    `;

    const informeContenedor = document.getElementById('contenedor-informe');
    informeContenedor.innerHTML = "";
    
    // Filtrar fallos O dudas (incluso si la duda fue correcta, a veces el usuario quiere repasarla, 
    // pero tu instrucción pedía "revisión de preguntas falladas y o dudadas", así que incluyo ambas).
    const fallosODudas = respuestasUsuario.filter(r => !r.esCorrecta || r.dudada);
    
    if (fallosODudas.length > 0) {
        informeContenedor.innerHTML = `<h3 style="color: #9c4dcc; margin: 20px 0; text-align:center;">REVISIÓN</h3>`;
        fallosODudas.forEach((r, idx) => {
            const item = document.createElement('div');
            item.className = 'revision-item';
            
            // Borde amarillo si fue duda (acertada o no), o rojo si fue fallo puro.
            // Ajuste: Si falló es rojo. Si acertó pero dudó es amarillo.
            let colorBorde = "#dc3545"; 
            if (r.esCorrecta && r.dudada) colorBorde = "#f1c40f";

            item.style.borderLeft = `5px solid ${colorBorde}`;
            
            // Textos completos
            const textoSeleccionado = r.opciones[r.seleccionada] || "Sin respuesta";
            const textoCorrecto = r.opciones[r.correcta] || "Error data";

            item.innerHTML = `
                <p><strong>${r.pregunta}</strong></p>
                
                <p style="color: ${r.esCorrecta ? '#28a745' : '#dc3545'};">
                    Tu respuesta: <strong>${textoSeleccionado}</strong>
                </p>
                
                ${!r.esCorrecta ? `<p style="color: #28a745;">Correcta: <strong>${textoCorrecto}</strong></p>` : ''}
                
                <div style="
                    margin-top: 15px; 
                    padding: 10px; 
                    background: #333; 
                    border-radius: 6px; 
                    border-left: 3px solid #9c4dcc;
                    font-size: 0.95em; 
                    color: #e0e0e0;">
                    💡 ${r.feedback || "Sin explicación"}
                </div>
            `;
            informeContenedor.appendChild(item);
        });
    } else {
        informeContenedor.innerHTML = `<p style="text-align:center; color: #28a745;">¡Test perfecto! No hay nada que revisar.</p>`;
    }

    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-main" style="display:block; margin: 20px auto;" onclick="location.reload()">VOLVER AL INICIO</button>`;
}
