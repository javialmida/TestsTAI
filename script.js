// --- CONFIGURACIÓN SUPABASE ---
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";
const sb = supabase.createClient(SB_URL, SB_KEY);

// --- ESTADO GLOBAL ---
let state = { 
    q: [], 
    cur: 0, 
    ans: [], 
    mode: localStorage.getItem('user-test-mode') || 'estudio',
    status: 'waiting', 
    arriesgando: false,
    currentTestId: null, 
    currentTestName: "",
    currentIntentoId: null,
    bloquesCache: null,
    testsCache: null,
    timerInterval: null,
    seconds: 0
};

// --- OBJETO APP PRINCIPAL ---
const app = {

    // --- FUNCIONES DEL CRONÓMETRO ---
    startTimer: () => {
        app.stopTimer();
        state.seconds = 0;
        document.getElementById('timer').innerText = "00:00";
        document.getElementById('timer').classList.remove('hidden');
        
        state.timerInterval = setInterval(() => {
            state.seconds++;
            document.getElementById('timer').innerText = app.formatTime(state.seconds);
        }, 1000);
    },

    stopTimer: () => {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    },

    formatTime: (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },

    init: async () => {
        // Recuperar modo guardado
        const modoGuardado = localStorage.getItem('user-test-mode');
        if (modoGuardado) {
            const inputModo = document.querySelector(`input[name="modo"][value="${modoGuardado}"]`);
            if (inputModo) inputModo.checked = true;
        }

        try {
            // Listener cambio de modo
            document.querySelectorAll('input[name="modo"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    state.mode = e.target.value;
                    localStorage.setItem('user-test-mode', e.target.value);
                });
            });

            // Carga inicial de datos
            const [testsRes, bloquesRes, intentosRes] = await Promise.all([
                sb.from('tests').select(`id, nombre, tipo, identificador, visible, info, temas (nombre, bloque_id)`).eq('visible', true),
                sb.from('bloques').select('id, nombre'),
                sb.from('intentos').select('test_id, completado')
            ]);
            
            if (testsRes.error) throw testsRes.error;
            const tests = testsRes.data;
            const nombresBloques = bloquesRes.data || [];

            state.testsCache = tests;
            state.bloquesCache = nombresBloques;
            
            // Tests completados (check verde)
            const testsHechos = new Set((intentosRes.data || []).filter(i => i.completado).map(i => i.test_id));

            // 1. OFICIALES
            const oficiales = tests.filter(t => t.tipo === 'examen_simulacro');
            oficiales.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));

            document.getElementById('list-oficiales').innerHTML = oficiales.map(t => 
                renderTestButton(t, testsHechos.has(t.id))
            ).join('');

            // 2. AGRUPAR POR BLOQUE
            const temasTests = tests.filter(t => t.tipo === 'test_por_tema');
            const bloques = {};
            temasTests.forEach(t => {
                const bId = t.temas?.bloque_id || "Sin Bloque";
                if (!bloques[bId]) bloques[bId] = [];
                bloques[bId].push(t);
            });

            // 3. RENDERIZAR ACORDEÓN
            const listTemas = document.getElementById('list-temas');
            listTemas.innerHTML = ""; 

            Object.keys(bloques).sort().forEach(bId => {
                const bloqueEncontrado = nombresBloques.find(b => b.id == bId);
                const nombreMostrar = bloqueEncontrado ? bloqueEncontrado.nombre : `BLOQUE ${bId}`;

                bloques[bId].sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));

                const detalles = document.createElement('details');
                detalles.className = 'bloque-container';
                detalles.innerHTML = `
                    <summary class="bloque-header">
                        <span>📦 ${nombreMostrar}</span>
                        <small>${bloques[bId].length} tests</small>
                    </summary>
                    <div class="bloque-content">
                        ${bloques[bId].map(t => renderTestButton(t, testsHechos.has(t.id))).join('')}
                    </div>
                `;
                listTemas.appendChild(detalles);
            });
        } catch (err) { console.error("Error init:", err.message); }

        // Listener para cerrar otros acordeones
        document.addEventListener('click', (e) => {
            const clickedDetails = e.target.closest('.bloque-container');
            if (clickedDetails && !e.target.closest('.bloque-content')) {
                const todosLosBloques = document.querySelectorAll('.bloque-container');
                todosLosBloques.forEach((bloque) => {
                    if (bloque !== clickedDetails) {
                        bloque.removeAttribute('open');
                    }
                });
            }
        });
    }, 

    prepararRepaso: async (tipo) => {
        try {
            app.resetState();
            let ids = []; 

            // Carga de seguridad si caché vacía
            if (!state.testsCache) {
                const { data: testsCargados, error: errCache } = await sb.from('tests').select('*');
                if (errCache) throw errCache;
                state.testsCache = testsCargados;
            }

            if (tipo === 'simulacro') {
                const { data: intentos } = await sb.from('intentos')
                    .select('test_id')
                    .eq('completado', true);
            
                if (!intentos || intentos.length === 0) return alert("¡Aún no has completado ningún test para generar un simulacro!");

                const testIdsCompletados = [...new Set(intentos.map(i => i.test_id))];
                const testsValidos = state.testsCache.filter(t => 
                    testIdsCompletados.includes(t.id) && t.tipo === 'test_por_tema'
                ).map(t => t.id);

                if (testsValidos.length === 0) return alert("Has completado tests, pero ninguno es 'Por Tema'.");

                const slider = document.getElementById('simulacro-range');
                const limitePreguntas = slider ? parseInt(slider.value, 10) : 100;
                const modoRadio = document.querySelector('input[name="simulacro-modo"]:checked');
                const modo = modoRadio ? modoRadio.value : 'todo'; 

                let rawData = [];

                if (modo === 'fallos') {
                    const { data: errores, error } = await sb.from('errores')
                        .select('pregunta_id, test_id')
                        .in('test_id', testsValidos);
                    
                    if (error) throw error;
                    if (!errores || errores.length === 0) return alert("✅ ¡Genial! No tienes fallos registrados en tus tests completados.");
                    
                    rawData = errores.map(e => ({ id: e.pregunta_id, test_id: e.test_id }));

                } else {
                    const { data, error } = await sb.from('preguntas')
                        .select('id, test_id')
                        .in('test_id', testsValidos);

                    if (error) throw error;
                    rawData = data;
                }

                if (!rawData || rawData.length === 0) return alert("Error: No se encontraron preguntas disponibles.");

                // Algoritmo Round Robin
                const bolsasPorTema = {};
                rawData.forEach(p => {
                    if (!bolsasPorTema[p.test_id]) bolsasPorTema[p.test_id] = [];
                    bolsasPorTema[p.test_id].push(p.id);
                });

                Object.values(bolsasPorTema).forEach(lista => lista.sort(() => Math.random() - 0.5));

                ids = [];
                const keys = Object.keys(bolsasPorTema);
                let buscando = true;

                while (ids.length < limitePreguntas && buscando) {
                    buscando = false; 
                    for (const key of keys) {
                        if (ids.length >= limitePreguntas) break; 
                        
                        if (bolsasPorTema[key].length > 0) {
                            ids.push(bolsasPorTema[key].pop()); 
                            buscando = true; 
                        }
                    }
                }
                
                const icono = modo === 'fallos' ? '⚠️' : '🤖';
                state.currentTestName = `${icono} SIMULACRO (${ids.length} PREGUNTAS)`;
            }
            else { 
                // REPASO DE ERRORES (Crítico, Express, Semanal)
                let query = sb.from('errores').select('pregunta_id, veces_fallada, ultimo_fallo');
                
                if (tipo === 'critico') {
                    query = query.order('veces_fallada', { ascending: false }).limit(30);
                    state.currentTestName = "🔥 MODO CRÍTICO";
                } else if (tipo === 'express') {
                    query = query.order('ultimo_fallo', { ascending: false }).limit(100); 
                    state.currentTestName = "⚡ REPASO EXPRESS";
                } else if (tipo === 'semanal') {
                    const unaSemanaAtras = new Date();
                    unaSemanaAtras.setDate(unaSemanaAtras.getDate() - 7);
                    query = query.gte('ultimo_fallo', unaSemanaAtras.toISOString())
                                 .order('ultimo_fallo', { ascending: false }).limit(50);
                    state.currentTestName = "📅 REPASO SEMANAL";
                }

                const { data: listaErrores, error: errErr } = await query;
                if (errErr) throw errErr;
                if (!listaErrores || listaErrores.length === 0) return alert("¡Sin fallos registrados para este modo!");
                
                ids = listaErrores.map(e => e.pregunta_id);
                if (tipo === 'express') ids = ids.sort(() => Math.random() - 0.5).slice(0, 20);
            }

            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', ids);
            if (errP) throw errP;

            state.q = preguntas.sort(() => Math.random() - 0.5);
            state.mode = document.querySelector('input[name="modo"]:checked').value;
            state.currentIntentoId = null; 

            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer(); 
            app.render();

        } catch (error) { 
            console.error(error); 
            alert("Ocurrió un error al generar el repaso. Revisa la consola.");
        }
    },

    resetState: () => {
        app.stopTimer();
        state = { q: [], cur: 0, ans: [], mode: 'estudio', status: 'waiting', arriesgando: false, currentTestId: null, currentTestName: "", currentIntentoId: null };
        document.getElementById('q-feedback')?.classList.add('hidden');
        document.getElementById('counter')?.classList.add('hidden');
        document.getElementById('btn-arriesgando')?.classList.remove('active');
        document.getElementById('btn-salir')?.classList.add('hidden');
    },

    registrarError: async (preguntaId, testId) => {
        try {
            const { data: ex, error } = await sb.from('errores').select('id, veces_fallada').eq('pregunta_id', preguntaId).maybeSingle();
            
            if (error) throw error;

            if (ex) {
                await sb.from('errores').update({ 
                    veces_fallada: ex.veces_fallada + 1, 
                    ultimo_fallo: new Date().toISOString() 
                }).eq('id', ex.id);
            } else {
                await sb.from('errores').insert([{ 
                    pregunta_id: preguntaId, 
                    test_id: testId,
                    veces_fallada: 1,
                    ultimo_fallo: new Date().toISOString()
                }]);
            }
        } catch (err) { console.error("Error registrando fallo:", err); }
    },

    start: async (testId) => {
        try {
            app.resetState();
            const { data: testInfo } = await sb.from('tests').select('nombre, identificador').eq('id', testId).single();
            const { data: preguntas, error } = await sb.from('preguntas').select('*').eq('test_id', testId).order('id', { ascending: true });
            if (error) throw error;
            state.q = preguntas;
            state.currentTestId = testId;
            state.currentTestName = testInfo ? `${testInfo.identificador || ''} ${testInfo.nombre}` : "Test";
            state.mode = document.querySelector('input[name="modo"]:checked').value; 
            
            const { data: intento, error: errorIntento } = await sb.from('intentos').insert([{ 
                test_id: testId, 
                aciertos: 0, 
                fallos: 0, 
                arriesgadas: 0
            }]).select().single();
            
            if (errorIntento) throw errorIntento;
            state.currentIntentoId = intento.id;

            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer();
            app.render();
        } catch (err) { alert(err.message); }
    },

    actualizarIntento: async () => {
        if (!state.currentIntentoId) return;
        const aciertos = state.ans.filter((a, i) => a && a.letra === state.q[i].correcta.toLowerCase()).length;
        const arriesgadas = state.ans.filter(a => a && a.arriesgada).length;
        const fallos = state.ans.filter((a, i) => a && a.letra !== state.q[i].correcta.toLowerCase()).length;
        
        await sb.from('intentos').update({ 
            aciertos, fallos, arriesgadas 
        }).eq('id', state.currentIntentoId);
    }, 

    render: () => {
        const item = state.q[state.cur];
        state.status = 'waiting';
        state.arriesgando = false;
        document.getElementById('btn-arriesgando').classList.remove('active');
        document.getElementById('counter').innerText = `Pregunta ${state.cur + 1}/${state.q.length}`;
        document.getElementById('counter').classList.remove('hidden');
        
        document.getElementById('q-enunciado').innerHTML = `<div style="font-size: 0.6em; color: #888; margin-bottom: 5px; text-transform: uppercase;">${state.currentTestName}</div>${state.cur + 1}. ${item.enunciado}`;

        const imgEl = document.getElementById('question-img');
        if (item.imagen_url) {
            imgEl.src = item.imagen_url;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.classList.add('hidden');
            imgEl.src = ''; 
        }
        
        document.getElementById('q-feedback').classList.add('hidden');
        const btnAccion = document.getElementById('btn-accion');
        btnAccion.innerText = (state.mode === 'examen') ? "SIGUIENTE" : "CORREGIR";
        btnAccion.disabled = true;
        const container = document.getElementById('q-options');
        container.innerHTML = "";
        ['a','b','c','d'].forEach(l => {
            if(item['opcion_'+l]){
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerHTML = `${l.toUpperCase()}) ${item['opcion_'+l]}`;
                btn.onclick = () => app.handleSelect(l, btn);
                container.appendChild(btn);
            }
        });
    },

    handleSelect: (letra, btn) => {
        if (state.status !== 'waiting') return;
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.ans[state.cur] = { letra, arriesgada: state.arriesgando };
        document.getElementById('btn-accion').disabled = false;
    },

    manejarAccion: () => {
        if (state.mode === 'examen') app.siguiente();
        else {
            const btn = document.getElementById('btn-accion');
            if (btn.innerText === "CORREGIR") app.corregir();
            else app.siguiente();
        }
    },

    corregir: async () => {
        const item = state.q[state.cur];
        const userSel = state.ans[state.cur]?.letra;
        const correcta = item.correcta.toLowerCase();
        document.querySelectorAll('.option-btn').forEach(b => {
            const l = b.innerText[0].toLowerCase();
            if (l === correcta) b.classList.add('correct');
            if (l === userSel && userSel !== correcta) b.classList.add('incorrect');
        });
        if (userSel !== correcta) await app.registrarError(item.id, item.test_id);
        if (item.feedback) { 
            const fbDiv = document.getElementById('q-feedback');
            fbDiv.innerText = "💡 " + item.feedback;
            fbDiv.classList.remove('hidden');
        }
        state.status = 'done';
        document.getElementById('btn-accion').innerText = "SIGUIENTE";
        
        await app.actualizarIntento();
    },

    siguiente: () => {
        if (state.mode === 'examen') {
            const item = state.q[state.cur];
            const res = state.ans[state.cur];
            const correcta = item.correcta.toLowerCase();
            
            if (!res || res.letra !== correcta) {
                app.registrarError(item.id, item.test_id);
            }
            app.actualizarIntento();
        }

        if (state.cur < state.q.length - 1) { 
            state.cur++; 
            app.render(); 
        } else {
            app.finalizar();
        }
    },

    toggleArriesgando: () => {
        state.arriesgando = !state.arriesgando;
        document.getElementById('btn-arriesgando').classList.toggle('active');
        if (state.ans[state.cur]) state.ans[state.cur].arriesgada = state.arriesgando;
    },

    finalizar: async () => {
        app.switchView('view-results');
        document.getElementById('btn-salir').classList.add('hidden');
        document.getElementById('counter').classList.add('hidden');
        const total = state.q.length;
        const aciertos = state.ans.filter((a, i) => a && a.letra === state.q[i].correcta.toLowerCase()).length;
        const arriesgadas = state.ans.filter(a => a && a.arriesgada).length;
        const fallos = total - aciertos;
        const porcentaje = ((aciertos / total) * 100).toFixed(1);

        document.getElementById('final-stats').innerHTML = `
            <div class="dominio-container">
                <div class="dominio-card">
                    <h2>DOMINIO FINAL</h2>
                    <div class="dominio-porcentaje">${porcentaje}%</div>
                    <div style="display: flex; gap: 15px; justify-content: center; font-weight: bold; margin-top:15px;">
                        <span style="color: var(--green);">✅ ${aciertos} Aciertos</span>
                        <span style="color: var(--red);">❌ ${fallos} Fallos</span>
                        <span style="color: #ff9800;">⚠️ ${arriesgadas} Dudas</span>
                    </div>
                    <p class="dominio-mensaje">Has completado el test con éxito. Revisa tus fallos a continuación.</p>
                </div>
            </div>
            <div id="revision-list" style="margin-top: 30px;"></div>`;
            
        app.renderRevision();
        
        if (state.currentIntentoId) {
            await sb.from('intentos').update({ 
                aciertos: aciertos, 
                fallos: fallos, 
                arriesgadas: arriesgadas,
                completado: true 
            }).eq('id', state.currentIntentoId);
        }
    },

    renderRevision: () => {
        const container = document.getElementById('revision-list');
        const listaTests = state.testsCache || [];

        const html = state.q.map((p, i) => {
            const res = state.ans[i];
            const esCorrecta = res && res.letra === p.correcta.toLowerCase();
            
            if (esCorrecta && (!res || !res.arriesgada)) return '';

            let uCol = res ? (esCorrecta ? "#ff9800" : "var(--red)") : "var(--text)";

            // --- 1. IDENTIFICADOR Y NOMBRE ---
            const testInfo = listaTests.find(t => t.id == p.test_id);
            
            let nombreTest = '';
            if (testInfo) {
                // Concatenamos Identificador + Espacio + Nombre
                nombreTest = `${testInfo.identificador || ''} ${testInfo.nombre}`.trim();
            } else if (state.currentTestId == p.test_id) {
                // Fallback si no está en caché
                nombreTest = state.currentTestName || '';
            }

            // --- 2. NÚMERO DE ORDEN ---
            const numPregunta = p.numero_orden || (i + 1);

            return `
                <div class="rev-item" style="border-left: 5px solid ${esCorrecta ? 'var(--green)' : 'var(--red)'}; padding: 15px; margin-bottom: 15px; background: rgba(255,255,255,0.03); text-align: left; border-radius: 4px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: ${esCorrecta ? 'var(--green)' : 'var(--red)'}">
                        ${esCorrecta ? '✅ ACERTADA (CON DUDA)' : '❌ FALLO'}
                    </div>
                    
                    <div style="font-size: 0.85em; color: var(--text); opacity: 0.9; margin-bottom: 8px; font-weight: bold; text-transform: uppercase;">
                        ${nombreTest}
                    </div>

                    <div style="margin-bottom: 12px; font-size: 1.05em;">
                        <strong>${numPregunta}.</strong> ${p.enunciado}
                    </div>

                    <div style="font-size: 0.95em; margin-bottom: 5px;">
                        <span style="opacity: 0.8;">Tu respuesta:</span>
                        <strong style="color: ${uCol};">
                            ${res ? res.letra.toUpperCase() + ') ' + p['opcion_' + res.letra] : 'No contestada'}
                        </strong>
                    </div>
                    <div style="font-size: 0.95em;">
                        <span style="opacity: 0.8;">Respuesta correcta:</span>
                        <strong style="color: var(--green);">
                            ${p.correcta.toUpperCase()}) ${p['opcion_' + p.correcta.toLowerCase()]}
                        </strong>
                    </div>
                    ${p.feedback ? `<div style="margin-top: 12px; padding: 10px; background: rgba(88,166,255,0.1); border-radius: 4px; font-style: italic; font-size: 0.9em; color: #a5d6ff;">💡 ${p.feedback}</div>` : ''}
                </div>`;
        }).join('');
        
        container.innerHTML = "<h3 style='margin-top:40px; border-bottom: 1px solid #30363d; padding-bottom:10px;'>Revisión de Errores y Dudas</h3>" + (html || '<p style="color:var(--green)">¡Examen perfecto!</p>');
    },

    switchView: (id) => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    },

    renderDashboard: async () => {
        app.switchView('view-stats');
        const listBloques = document.getElementById('stats-bloques-list');
        listBloques.innerHTML = "<p style='text-align:center; opacity:0.5;'>Analizando base de datos...</p>";
        
        try {
            const [intentosRes, testsRes, bloquesRes] = await Promise.all([
                sb.from('intentos').select('*').order('id', { ascending: false }),
                sb.from('tests').select('id, nombre, identificador, temas(nombre, bloque_id)'), 
                sb.from('bloques').select('id, nombre')
            ]);
    
            if (intentosRes.error || testsRes.error || bloquesRes.error) throw new Error("Error de red");
            
            const todosLosIntentos = (intentosRes.data || []).filter(i => i.completado);
            const todosLosTests = testsRes.data || [];
            const todosLosBloques = bloquesRes.data || [];
    
            if (todosLosIntentos.length === 0) {
                listBloques.innerHTML = "<p style='text-align:center; padding:20px; opacity:0.6;'>No hay datos todavía. ¡Completa un test!</p>"; 
                return;
            }
    
            const ultimosIntentosPorTest = {};
            todosLosIntentos.forEach(intento => {
                if (!ultimosIntentosPorTest[intento.test_id]) {
                    ultimosIntentosPorTest[intento.test_id] = intento;
                }
            });

            const statsMap = {};
    
            Object.values(ultimosIntentosPorTest).forEach(i => {
                const testInfo = todosLosTests.find(t => t.id === i.test_id);
                if (!testInfo) return;
    
                const bId = testInfo.temas?.bloque_id || 0; 
                const bloqueNombre = todosLosBloques.find(b => b.id === bId)?.nombre || "OTROS / VARIOS";
                
                if (!statsMap[bId]) {
                    statsMap[bId] = { nombre: bloqueNombre, porcentajesTests: [], testsDetalle: [] };
                }

                const totalRespondidas = i.aciertos + i.fallos;
                const pTest = totalRespondidas > 0 ? (i.aciertos / totalRespondidas) * 100 : 0;
                
                statsMap[bId].porcentajesTests.push(pTest);
                statsMap[bId].testsDetalle.push({
                    id: i.test_id,
                    nombre: testInfo.nombre,
                    identificador: testInfo.identificador,
                    porcentaje: pTest.toFixed(0)
                });
            });
    
            const todosLosPorcentajes = Object.values(statsMap).flatMap(b => b.porcentajesTests);
            const porcentajeGlobal = (todosLosPorcentajes.reduce((a, b) => a + b, 0) / todosLosPorcentajes.length).toFixed(1);
            const totalRespondidasGlobal = todosLosIntentos.reduce((a, c) => a + (c.aciertos + c.fallos), 0);
            const diasEstudiados = [...new Set(todosLosIntentos.map(i => i.fecha?.split('T')[0]))].filter(Boolean).length;
    
            document.getElementById('stat-total-preguntas').innerText = totalRespondidasGlobal;
            document.getElementById('stat-acierto-global').innerText = `${porcentajeGlobal}%`;
            document.getElementById('stat-racha').innerText = diasEstudiados;
    
            listBloques.innerHTML = Object.keys(statsMap)
                .sort((a, b) => {
                    const nameA = statsMap[a].nombre.toUpperCase();
                    const nameB = statsMap[b].nombre.toUpperCase();
                    if (nameA.includes("EXÁMENES") || nameA.includes("SIMULACRO")) return 1;
                    if (nameB.includes("EXÁMENES") || nameB.includes("SIMULACRO")) return -1;
                    return a - b;
                })
                .map(bId => {
                    const s = statsMap[bId];
                    const pBloque = (s.porcentajesTests.reduce((a, b) => a + b, 0) / s.porcentajesTests.length).toFixed(0);
                    const colorBloque = pBloque >= 70 ? 'var(--green)' : pBloque >= 40 ? '#d29922' : 'var(--red)';
    
                    return `
                        <details class="bloque-container">
                            <summary class="bloque-header">
                                <div style="flex-grow:1">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; padding-right:15px;">
                                        <span>📦 ${s.nombre}</span>
                                        <span style="color:${colorBloque}">${pBloque}%</span>
                                    </div>
                                    <div class="progress-bg" style="margin:0; height:6px;">
                                        <div class="progress-fill" style="width:${pBloque}%; background:${colorBloque}"></div>
                                    </div>
                                </div>
                            </summary>
                            <div class="bloque-content">
                                ${s.testsDetalle.map(t => `
                                    <div class="test-row" onclick="app.start(${t.id})" style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.02); margin: 4px 0; border-bottom: 1px solid #30363d;">
                                        <div style="font-size:0.9em;">
                                            <span class="tag-id">${t.identificador || 'TEST'}</span>
                                            <strong>${t.nombre}</strong>
                                        </div>
                                        <span style="font-weight:bold; color:${t.porcentaje >= 70 ? 'var(--green)' : '#888'}">${t.porcentaje}%</span>
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    `;
                }).join('');
    
        } catch (err) { 
            console.error("Error Dashboard:", err); 
            listBloques.innerHTML = `<p style='color:var(--red); text-align:center;'>Error al cargar estadísticas: ${err.message}</p>`; 
        }
    },

    confirmarSalida: () => { if(confirm("¿Deseas salir al menú principal?")) location.reload(); },

    resetStats: async () => {
        const confirmar = confirm("⚠️ ¿ESTÁS SEGURO? Se borrarán todos tus intentos y errores de forma permanente.");
        if (!confirmar) return;

        try {
            const resErrores = await sb.from('errores').delete().gt('id', 0);
            const resIntentos = await sb.from('intentos').delete().gt('id', 0);

            if (resErrores.error || resIntentos.error) {
                throw new Error(resErrores.error?.message || resIntentos.error?.message);
            }

            alert("Estadísticas borradas correctamente.");
            location.reload();
        } catch (err) {
            alert("Error al borrar: " + err.message);
        }
    },

    prepararRepasoPorNombreTema: async (nombreTema) => {
        try {
            const slider = document.getElementById('tema-range');
            const limite = slider ? parseInt(slider.value, 10) : 100;
            const modoRadio = document.querySelector('input[name="tema-modo"]:checked');
            const modo = modoRadio ? modoRadio.value : 'fallos'; 

            const testsDelTema = state.testsCache.filter(t => t.temas && t.temas.nombre === nombreTema);
            const idsTests = testsDelTema.map(t => t.id);
            if (idsTests.length === 0) return alert("No hay tests asociados a este tema.");

            let rawData = [];

            if (modo === 'fallos') {
                const { data: fallos, error: errorFallos } = await sb.from('errores').select('pregunta_id').in('test_id', idsTests);
                if (errorFallos) throw errorFallos;
                if (!fallos || fallos.length === 0) return alert("✅ ¡Genial! No tienes fallos registrados en este tema.");

                const idsPreguntas = fallos.map(f => f.pregunta_id);
                const { data, error } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
                if (error) throw error;
                rawData = data;

            } else {
                const { data, error } = await sb.from('preguntas').select('*').in('test_id', idsTests);
                if (error) throw error;
                rawData = data;
            }

            if (!rawData || rawData.length === 0) return alert("No se encontraron preguntas.");

            rawData.sort(() => Math.random() - 0.5);
            const preguntasFinales = rawData.slice(0, limite);

            app.resetState();
            state.q = preguntasFinales;
            
            const icono = modo === 'fallos' ? '⚠️' : '📚';
            const etiqueta = modo === 'fallos' ? 'REPASO FALLOS' : 'TEST TEMA';
            state.currentTestName = `${icono} ${etiqueta}: ${nombreTema} (${state.q.length})`;
            state.currentTestId = null; 

            app.switchView('view-test');
            document.getElementById('modal-temas').classList.add('hidden');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer();
            app.render();

        } catch (err) {
            console.error(err);
            alert("Error al cargar el tema.");
        }
    },

    prepararRepasoPorTestId: async (testId, nombreTest) => {
        try {
            const slider = document.getElementById('tema-range');
            const limite = slider ? parseInt(slider.value, 10) : 100;
            const modoRadio = document.querySelector('input[name="tema-modo"]:checked');
            const modo = modoRadio ? modoRadio.value : 'fallos';

            let rawData = [];

            if (modo === 'fallos') {
                const { data: fallos, error: errorFallos } = await sb.from('errores').select('pregunta_id').eq('test_id', testId);
                if (errorFallos) throw errorFallos;
                if (!fallos || fallos.length === 0) return alert("✅ ¡Genial! No tienes fallos en este test.");

                const idsPreguntas = fallos.map(f => f.pregunta_id);
                const { data, error } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
                if (error) throw error;
                rawData = data;

            } else {
                const { data, error } = await sb.from('preguntas').select('*').eq('test_id', testId);
                if (error) throw error;
                rawData = data;
            }

            if (!rawData || rawData.length === 0) return alert("Este test está vacío.");

            rawData.sort(() => Math.random() - 0.5);
            const preguntasFinales = rawData.slice(0, limite);

            app.resetState();
            state.q = preguntasFinales;
            
            const icono = modo === 'fallos' ? '⚠️' : '📝';
            state.currentTestName = `${icono} ${nombreTest} (${state.q.length})`;
            state.currentTestId = testId;

            app.switchView('view-test');
            document.getElementById('modal-temas').classList.add('hidden');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer();
            app.render();

        } catch (err) {
            console.error(err);
            alert("Error al cargar el test.");
        }
    },
    
    // --- NUEVO: START REPASO TEMA (SINGLE) USANDO LA LÓGICA EXISTENTE ---
    startRepasoTema: (nombre) => {
        app.prepararRepasoPorNombreTema(nombre);
    }

}; // <--- ¡AQUÍ ESTÁ LA LLAVE QUE FALTABA! CIERRA EL OBJETO APP

// --- FUNCIONES AUXILIARES FUERA DEL OBJETO APP ---

function renderTestButton(t, isHecho) {
    const hechoStr = isHecho ? ' ✅' : '';
    const badgeClass = t.tipo === 'examen_simulacro' ? 'badge-blue' : 'tag-id';
    const badgeText = t.identificador || (t.tipo === 'examen_simulacro' ? 'OFICIAL' : 'TEST');

    if (t.info) {
        const safeInfo = t.info.replace(/"/g, '&quot;');
        return `
        <div class="test-row-complex">
            <div class="test-main-part" onclick="app.start(${t.id})">
                <span class="${badgeClass}">${badgeText}</span>
                <strong>${t.nombre}${hechoStr}</strong>
            </div>
            <div class="test-info-part" data-msg="${safeInfo}" onclick="alert(this.dataset.msg)">
                ℹ️
            </div>
        </div>`;
    }

    return `
    <div class="test-row ${t.tipo === 'examen_simulacro' ? 'oficial-row' : ''}" onclick="app.start(${t.id})">
        <span class="${badgeClass}">${badgeText}</span>
        <strong>${t.nombre}${hechoStr}</strong> 
    </div>`;
}

// --- EXTENSIONES DEL OBJETO APP (FUNCIONALIDAD MULTI-TEMA) ---

// --- EXTENSIONES DEL OBJETO APP (FUNCIONALIDAD MULTI-TEMA CORREGIDA) ---

// 1. Sobrescribimos la función de abrir modal
app.abrirModalRepasoTema = () => {
    const modal = document.getElementById('modal-temas');
    const listContainer = document.getElementById('lista-temas-repaso');
    
    // Reseteamos contador
    const spanCount = document.getElementById('count-sel');
    if(spanCount) spanCount.innerText = "0";

    listContainer.innerHTML = "";
    modal.classList.remove('hidden');

    if (!state.bloquesCache || !state.testsCache) {
        listContainer.innerHTML = "<p>Cargando datos...</p>";
        return;
    }

    // Ordenamos bloques (Oficiales primero)
    const bloquesOrdenados = [...state.bloquesCache].sort((a, b) => {
        const nombreA = a.nombre.toUpperCase();
        const nombreB = b.nombre.toUpperCase();
        const esExamenA = nombreA.includes("OFICIAL") || nombreA.includes("SIMULACRO") || nombreA.includes("EXÁMENES");
        const esExamenB = nombreB.includes("OFICIAL") || nombreB.includes("SIMULACRO") || nombreB.includes("EXÁMENES");
        if (esExamenA && !esExamenB) return 1;
        if (!esExamenA && esExamenB) return -1;
        return nombreA.localeCompare(nombreB, undefined, { numeric: true });
    });

    bloquesOrdenados.forEach(bloque => {
        const testsDelBloque = state.testsCache.filter(t => t.temas && t.temas.bloque_id === bloque.id);
        if (testsDelBloque.length === 0) return;

        // DETECTAR SI ES BLOQUE ESPECIAL (Exámenes/Simulacros)
        const esBloqueExamen = bloque.nombre.toUpperCase().includes("EXÁMENES") || 
                               bloque.nombre.toUpperCase().includes("SIMULACRO") || 
                               bloque.nombre.toUpperCase().includes("OFICIAL");

        let itemsParaMostrar = [];

        if (esBloqueExamen) {
            // CASO A: BLOQUE DE EXÁMENES -> Mostramos los TESTS individuales
            // Ordenamos alfabéticamente los tests
            testsDelBloque.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
            
            // Usamos el nombre del test como valor
            itemsParaMostrar = testsDelBloque.map(t => ({
                label: t.nombre,
                valor: t.nombre, // El valor del checkbox será el nombre del test
                esTest: true,
                id: t.id
            }));

        } else {
            // CASO B: BLOQUE NORMAL -> Mostramos los TEMAS agrupados
            const temasUnicos = [...new Set(testsDelBloque.map(t => t.temas.nombre))].sort();
            
            itemsParaMostrar = temasUnicos.map(tema => ({
                label: tema,
                valor: tema, // El valor del checkbox será el nombre del tema
                esTest: false
            }));
        }

        // Renderizamos el acordeón
        const detalles = document.createElement('details');
        detalles.className = 'bloque-container';
        // Si es examen, abrimos por defecto para mayor comodidad (opcional)
        if (esBloqueExamen) detalles.open = true; 

        detalles.innerHTML = `
            <summary class="bloque-header">
                <span>📦 ${bloque.nombre}</span>
                <small>${itemsParaMostrar.length} ${esBloqueExamen ? 'tests' : 'temas'}</small>
            </summary>
            <div class="bloque-content">
                ${itemsParaMostrar.map(item => `
                    <div class="tema-row">
                        <span class="tema-label" onclick="${item.esTest ? `app.start(${item.id})` : `app.startRepasoTema('${item.valor}')`}">
                            ${item.esTest ? '📄 ' : ''}${item.label}
                        </span>
                        <input type="checkbox" class="tema-chk" value="${item.valor}" onchange="app.updateMultiCount()">
                    </div>
                `).join('')}
            </div>
        `;
        listContainer.appendChild(detalles);
    });
};

// 2. Actualizar contador
app.updateMultiCount = () => {
    const checked = document.querySelectorAll('.tema-chk:checked').length;
    const span = document.getElementById('count-sel');
    if(span) span.innerText = checked;
};

// 3. Iniciar repaso multi-tema (CON ROUND ROBIN EQUITATIVO)
app.startRepasoMultiTema = async () => {
    try {
        const checkboxes = document.querySelectorAll('.tema-chk:checked');
        const seleccionados = Array.from(checkboxes).map(cb => cb.value);

        if (seleccionados.length === 0) return alert("⚠️ Selecciona al menos un tema o test.");

        document.getElementById('modal-temas').classList.add('hidden');

        // Configuración UI
        const slider = document.getElementById('tema-range');
        const limite = slider ? parseInt(slider.value, 10) : 50; 
        const modoRadio = document.querySelector('input[name="tema-modo"]:checked');
        const modo = modoRadio ? modoRadio.value : 'todo'; // <--- AQUÍ SE RESPETA LA ELECCIÓN (fallos o todo)

        // 1. Identificar Tests implicados y crear mapa de Pertenencia
        // Necesitamos saber qué test pertenece a qué "selección" para el reparto equitativo
        const mapTestIdToSeleccion = {};
        
        const testsCoincidentes = state.testsCache.filter(t => {
            // Caso A: Es un test que pertenece a un TEMA seleccionado
            if (t.temas && seleccionados.includes(t.temas.nombre)) {
                mapTestIdToSeleccion[t.id] = t.temas.nombre; // Lo agruparemos bajo el nombre del tema
                return true;
            }
            // Caso B: Es un TEST específico seleccionado (Exámenes/Simulacros)
            if (seleccionados.includes(t.nombre)) {
                mapTestIdToSeleccion[t.id] = t.nombre; // Lo agruparemos bajo su propio nombre
                return true;
            }
            return false;
        });
        
        const idsTests = testsCoincidentes.map(t => t.id);

        if (idsTests.length === 0) return alert("No se encontraron tests para la selección.");

        // 2. Obtener Preguntas (Raw Data) respetando el MODO
        let rawData = [];

        if (modo === 'fallos') {
            // Solo buscamos en la tabla de errores
            const { data: fallos, error } = await sb.from('errores').select('pregunta_id, test_id').in('test_id', idsTests);
            if (error) throw error;
            if (!fallos || fallos.length === 0) return alert("✅ ¡Genial! No tienes fallos registrados en lo seleccionado.");
            
            // Necesitamos traer los datos completos de esas preguntas
            const idsPreguntas = fallos.map(f => f.pregunta_id);
            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
            if (errP) throw errP;
            
            // Re-asignamos el test_id correcto a la pregunta (por seguridad)
            rawData = preguntas.map(p => {
                // Buscamos el test_id original en el array de fallos si hace falta, 
                // aunque 'preguntas' ya suele traer 'test_id'.
                return p; 
            });

        } else {
            // Modo TODO: traemos todas las preguntas de los tests
            const { data: preguntas, error } = await sb.from('preguntas').select('*').in('test_id', idsTests);
            if (error) throw error;
            rawData = preguntas;
        }

        if (!rawData || rawData.length === 0) return alert("No se encontraron preguntas disponibles.");

        // 3. ALGORITMO ROUND ROBIN (Reparto Equitativo)
        
        // A. Crear "bolsas" por cada tema/test seleccionado
        const bolsas = {};
        seleccionados.forEach(sel => bolsas[sel] = []);

        // B. Repartir las preguntas en sus bolsas
        rawData.forEach(p => {
            const grupo = mapTestIdToSeleccion[p.test_id];
            if (grupo && bolsas[grupo]) {
                bolsas[grupo].push(p);
            }
        });

        // C. Barajar individualmente cada bolsa (para que no salgan siempre las mismas del tema)
        Object.values(bolsas).forEach(lista => lista.sort(() => Math.random() - 0.5));

        // D. Extraer una a una (Round Robin)
        const preguntasFinales = [];
        let buscando = true;

        while (preguntasFinales.length < limite && buscando) {
            buscando = false;
            for (const key of seleccionados) {
                if (preguntasFinales.length >= limite) break;
                
                if (bolsas[key].length > 0) {
                    preguntasFinales.push(bolsas[key].pop());
                    buscando = true; // Todavía quedan preguntas en alguna bolsa
                }
            }
        }

        // 4. Barajar el resultado final
        // Esto es importante para que no salgan: 1 de Const, 1 de SQL, 1 de Const... 
        // sino que salgan mezcladas, pero manteniendo la proporción 50/50.
        preguntasFinales.sort(() => Math.random() - 0.5);

        // 5. Iniciar Test
        app.resetState();
        state.q = preguntasFinales;
        state.currentTestName = `📚 REPASO MIXTO (${preguntasFinales.length} PREGUNTAS)`;
        state.mode = document.querySelector('input[name="modo"]:checked').value;

        app.switchView('view-test');
        document.getElementById('btn-salir').classList.remove('hidden');
        app.startTimer();
        app.render();

    } catch (error) {
        console.error(error);
        alert("Error generando el test multi-selección.");
    }
};

// --- INICIALIZACIÓN ---
window.onload = app.init;

// --- CONTROLADOR DE TECLADO ACTUALIZADO ---
document.addEventListener('keydown', (e) => {
    // Si estamos en la vista de test y no hay un modal abierto
    if (!document.getElementById('view-test').classList.contains('hidden')) {
        const key = e.key.toLowerCase();
        
        // 1. Selección de opciones (A, B, C, D)
        if (['a', 'b', 'c', 'd'].includes(key)) {
            const index = ['a', 'b', 'c', 'd'].indexOf(key);
            const buttons = document.querySelectorAll('#q-options .option-btn');
            if (buttons[index]) {
                buttons[index].click();
            }
        }
        
        // 2. Tecla R para conmutar el botón de ARRIESGANDO (NUEVO)
        if (key === 'r') {
            app.toggleArriesgando();
        }
        
        // 3. Barra espaciadora para Corregir / Siguiente
        if (e.code === 'Space') {
            e.preventDefault(); // Evita que la página haga scroll al pulsar espacio
            const btnAccion = document.getElementById('btn-accion');
            if (btnAccion && !btnAccion.disabled) {
                btnAccion.click();
            }
        }
    }
});