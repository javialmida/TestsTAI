// 1. CONFIGURACIÓN SUPABASE (Mantengo tus credenciales intactas)
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
    try {
        const data = await supabaseFetch("tests?select=*&visible=eq.true&order=id.asc");
        ['lista-B1', 'lista-B2', 'lista-B3', 'lista-B4', 'lista-oficiales'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });
        data.forEach(t => {
            const label = document.createElement('label');
            label.className = 'test-item';
            label.innerHTML = `<input type="radio" name="test-select" value="${t.id}" data-nombre="${t.nombre}"> <span>${t.nombre}</span>`;
            const cId = t.bloque_id === 5 ? 'lista-oficiales' : `lista-B${t.bloque_id}`;
            if (document.getElementById(cId)) document.getElementById(cId).appendChild(label);
        });
    } catch (e) { console.error(e); }
}

document.getElementById('btnComenzar').onclick = async () => {
    const sel = document.querySelector('input[name="test-select"]:checked');
    if (!sel) return alert("Selecciona un test 🚀");
    
    document.getElementById('btnComenzar').textContent = "CARGANDO...";
    
    try {
        const data = await supabaseFetch(`preguntas?test_id=eq.${sel.value}&order=numero_orden.asc`);
        preguntasTest = data.map(p => ({
            enunciado: p.enunciado,
            opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
            correcta: (p.correcta || 'a').toLowerCase().trim(),
            feedback: p.feedback || "Sin explicación adicional."
        }));
        
        modoEstudio = document.querySelector('input[name="modo"]:checked').value === 'estudio';
        respuestasUsuario = [];
        preguntaActualIndex = 0;
        puntuacion = { aciertos: 0, fallos: 0, arriesgadas: 0 };

        document.getElementById('pantalla-inicio').classList.add('hidden');
        document.querySelector('.footer-controls').classList.add('hidden');
        document.getElementById('pantalla-test').classList.remove('hidden');

        mostrarPregunta();
    } catch (e) { alert("Error al cargar"); }
    document.getElementById('btnComenzar').textContent = "COMENZAR TEST";
};

function mostrarPregunta() {
    esDudada = false;
    document.getElementById('btnArriesgando').classList.remove('active');
    document.getElementById('feedback-area').classList.add('hidden');
    
    const p = preguntasTest[preguntaActualIndex];
    document.getElementById('contador-preguntas').textContent = `Pregunta ${preguntaActualIndex + 1}/${preguntasTest.length}`;
    document.getElementById('enunciado').textContent = p.enunciado;
    
    const container = document.getElementById('opciones-lista');
    container.innerHTML = "";
    document.getElementById('btnAccion').disabled = true;
    document.getElementById('btnAccion').textContent = "CORREGIR";

    Object.entries(p.opciones).forEach(([letra, texto]) => {
        if (!texto) return;
        const btn = document.createElement('button');
        btn.className = 'opcion';
        btn.innerHTML = `<span class="letra">${letra.toUpperCase()}</span> ${texto}`;
        btn.onclick = () => {
            document.querySelectorAll('.opcion').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('btnAccion').disabled = false;
            document.getElementById('btnAccion').onclick = () => procesarRespuesta(letra);
        };
        container.appendChild(btn);
    });
}

function procesarRespuesta(seleccionada) {
    const p = preguntasTest[preguntaActualIndex];
    const esCorrecta = seleccionada === p.correcta;
    
    respuestasUsuario.push({
        pregunta: p.enunciado,
        seleccionada: seleccionada,
        correcta: p.correcta,
        esCorrecta: esCorrecta,
        feedback: p.feedback,
        dudada: esDudada,
        opciones: p.opciones
    });

    if (esDudada) puntuacion.arriesgadas++;
    if (esCorrecta) puntuacion.aciertos++; else puntuacion.fallos++;

    if (modoEstudio) {
        document.querySelectorAll('.opcion').forEach(btn => {
            const l = btn.querySelector('.letra').textContent.toLowerCase();
            if (l === p.correcta) btn.className = 'opcion correct'; 
            if (l === seleccionada && !esCorrecta) btn.className = 'opcion incorrect';
            btn.style.pointerEvents = "none";
        });
        document.getElementById('feedback-texto').textContent = p.feedback;
        document.getElementById('feedback-area').classList.remove('hidden');
        document.getElementById('btnAccion').textContent = "SIGUIENTE";
        document.getElementById('btnAccion').onclick = irASiguiente;
    } else {
        irASiguiente();
    }
}

function irASiguiente() {
    preguntaActualIndex++;
    if (preguntaActualIndex < preguntasTest.length) mostrarPregunta();
    else finalizarTest();
}

function finalizarTest() {
    document.getElementById('pantalla-test').classList.add('hidden');
    document.getElementById('pantalla-resultados').classList.remove('hidden');
    
    const total = preguntasTest.length;
    const nota = ((puntuacion.aciertos - (puntuacion.fallos * 0.33)) * 10 / total).toFixed(2);

    // 1. CAPSULAS EN HORIZONTAL (Usando tus clases exactas)
    document.getElementById('contenedor-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card card-aciertos"><h3>${puntuacion.aciertos}</h3><p>ACIERTOS</p></div>
            <div class="stat-card card-fallos"><h3>${puntuacion.fallos}</h3><p>FALLOS</p></div>
            <div class="stat-card card-dudas"><h3>${puntuacion.arriesgadas}</h3><p>DUDADAS</p></div>
        </div>
        <div class="nota-final" style="text-align:center; font-size: 2rem; margin: 20px 0; color: #7b2cbf;">${nota}</div>
    `;

    // 2. INFORME FINAL (Feedback de errores)
    const informeContenedor = document.getElementById('contenedor-informe');
    informeContenedor.innerHTML = "";
    
    const fallosODudas = respuestasUsuario.filter(r => !r.esCorrecta || r.dudada);
    
    if (fallosODudas.length > 0) {
        const h3 = document.createElement('h3');
        h3.style.color = "#9c4dcc";
        h3.style.textAlign = "center";
        h3.textContent = "REVISIÓN DE FALLOS Y DUDAS";
        informeContenedor.appendChild(h3);

        fallosODudas.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = "revision-item";
            // Usamos colores de tu CSS para el borde lateral
            const colorBorde = r.esCorrecta ? "#f1c40f" : "#dc3545";
            div.setAttribute('style', `border-left: 5px solid ${colorBorde}; background: #252525; padding: 15px; margin: 10px 0; border-radius: 8px;`);
            
            div.innerHTML = `
                <p><strong>${idx + 1}. ${r.pregunta}</strong></p>
                <p style="color: ${r.esCorrecta ? '#2ecc71' : '#ff4d4d'}">Tu respuesta: ${r.seleccionada.toUpperCase()}</p>
                ${!r.esCorrecta ? `<p style="color: #2ecc71">Correcta: ${r.correcta.toUpperCase()}</p>` : ''}
                <div style="background: #1a1a1a; padding: 10px; margin-top: 10px; font-size: 0.9em; border-radius: 4px; color: #bbb;">💡 ${r.feedback}</div>
            `;
            informeContenedor.appendChild(div);
        });
    }

    document.getElementById('contenedor-boton-volver').innerHTML = `<button class="btn-volver" onclick="location.reload()">VOLVER AL INICIO</button>`;
}

// 3. ESTADÍSTICAS (Título de test como enlace)
document.getElementById('btnEstadisticas').onclick = async () => {
    const data = await supabaseFetch("tests?select=*&visible=eq.true");
    const container = document.getElementById('pantalla-estadisticas');
    container.classList.remove('hidden');
    document.getElementById('pantalla-inicio').classList.add('hidden');
    
    container.innerHTML = `<h2 style="text-align:center">MIS ESTADÍSTICAS</h2>`;
    data.forEach(t => {
        const div = document.createElement('div');
        div.className = "bloque-est-container";
        div.innerHTML = `
            <div class="info-bloque">
                <a href="#" style="color: #9c4dcc; text-decoration: none;" onclick="event.preventDefault(); seleccionarTest('${t.id}')">📂 ${t.nombre}</a>
            </div>
            <div class="barra-fondo"><div class="barra-progreso" style="width: 0%"></div></div>
        `;
        container.appendChild(div);
    });
    container.innerHTML += `<button class="btn-volver" onclick="location.reload()">VOLVER</button>`;
};

function seleccionarTest(id) {
    const radio = document.querySelector(`input[value="${id}"]`);
    if (radio) {
        radio.checked = true;
        document.getElementById('pantalla-estadisticas').classList.add('hidden');
        document.getElementById('pantalla-inicio').classList.remove('hidden');
        radio.scrollIntoView({ behavior: 'smooth' });
    }
}

document.getElementById('btnArriesgando').onclick = function() {
    esDudada = !esDudada;
    this.classList.toggle('active', esDudada);
};
document.getElementById('btnSalir').onclick = () => location.reload();

window.onload = cargarMenuDinamico;
