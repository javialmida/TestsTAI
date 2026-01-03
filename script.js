// --- CONFIGURACIÓN SUPABASE ---
const SB_URL = "https://ogpprghtohbumqihzxwt.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncHByZ2h0b2hidW1xaWh6eHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMTA5MDMsImV4cCI6MjA4MjU4NjkwM30.TDkm0NHDNh0gec26s6gnvHH_euJPuGLqX5nghMXy2wI";
const sb = supabase.createClient(SB_URL, SB_KEY);

// 1. En el objeto state, inicializamos con el valor guardado o 'estudio' por defecto
let state = { 
    q: [], 
    cur: 0, 
    ans: [], 
    mode: localStorage.getItem('user-test-mode') || 'estudio', // Mantenemos tu clave
    status: 'waiting', 
    arriesgando: false,
    currentTestId: null, 
    currentTestName: "" 
};

const app = {
    init: async () => {
        // 1. Recuperar el modo guardado
        const modoGuardado = localStorage.getItem('user-test-mode');
        if (modoGuardado) {
            const inputModo = document.querySelector(`input[name="modo"][value="${modoGuardado}"]`);
            if (inputModo) inputModo.checked = true;
        }

        try {
            // Escuchar cambios para que no se pierdan al recargar
            document.querySelectorAll('input[name="modo"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    state.mode = e.target.value;
                    localStorage.setItem('user-test-mode', e.target.value);
                });
            });

            // --- CAMBIO: Traemos tests, bloques Y AHORA TAMBIÉN INTENTOS ---
            const [testsRes, bloquesRes, intentosRes] = await Promise.all([
                sb.from('tests').select(`id, nombre, tipo, identificador, visible, temas (nombre, bloque_id)`).eq('visible', true),
                sb.from('bloques').select('id, nombre'),
                sb.from('intentos').select('test_id') // <--- NUEVO: Pedimos los IDs de intentos
            ]);
            
            if (testsRes.error) throw testsRes.error;
            const tests = testsRes.data;
            const nombresBloques = bloquesRes.data || [];
            
            // --- NUEVO: Creamos un Set (lista única) con los IDs de tests que ya se han hecho ---
            const testsHechos = new Set((intentosRes.data || []).map(i => i.test_id));

            // 1. OFICIALES
            const oficiales = tests.filter(t => t.tipo === 'examen_simulacro');
            document.getElementById('list-oficiales').innerHTML = oficiales.map(t => `
                <div class="test-row oficial-row" onclick="app.start(${t.id})">
                    <span class="badge-blue">${t.identificador || 'OFICIAL'}</span>
                    <strong>${t.nombre}${testsHechos.has(t.id) ? ' ✅' : ''}</strong> 
                </div>`).join(''); // ^^^ AÑADIDO EL TERNARIO DEL TICK

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
                // Buscamos el nombre real del bloque usando el ID
                const bloqueEncontrado = nombresBloques.find(b => b.id == bId);
                const nombreMostrar = bloqueEncontrado ? bloqueEncontrado.nombre : `BLOQUE ${bId}`;

                const detalles = document.createElement('details');
                detalles.className = 'bloque-container';
                detalles.innerHTML = `
                    <summary class="bloque-header">
                        <span>📦 ${nombreMostrar}</span>
                        <small>${bloques[bId].length} tests</small>
                    </summary>
                    <div class="bloque-content">
                        ${bloques[bId].map(t => `
                            <div class="test-row" onclick="app.start(${t.id})">
                                <span class="tag-id">${t.identificador || 'TEST'}</span> 
                                <strong>${t.nombre}${testsHechos.has(t.id) ? ' ✅' : ''}</strong>
                            </div>
                        `).join('')}
                    </div>
                `;
                listTemas.appendChild(detalles);
            });
        } catch (err) { console.error("Error init:", err.message); }

        // Listener de seguridad para el acordeón
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
    }, //LLAVE DE CIERRE DE FUNCIÓN INIT

    prepararRepaso: async (tipo) => {
        try {
            app.resetState();
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
                query = query.gte('ultimo_fallo', unaSemanaAtras.toISOString()).order('ultimo_fallo', { ascending: false }).limit(50);
                state.currentTestName = "📅 REPASO SEMANAL";
            }
            const { data: listaErrores, error: errErr } = await query;
            if (errErr) throw errErr;
            if (!listaErrores || listaErrores.length === 0) return alert("¡Sin fallos registrados!");
            let ids = listaErrores.map(e => e.pregunta_id);
            if (tipo === 'express') ids = ids.sort(() => Math.random() - 0.5).slice(0, 20);
            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', ids);
            state.q = preguntas;
            state.mode = document.querySelector('input[name="modo"]:checked').value;
            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.render();
        } catch (error) { console.error(error); }
    },

    resetState: () => {
        state = { q: [], cur: 0, ans: [], mode: 'estudio', status: 'waiting', arriesgando: false, currentTestId: null, currentTestName: "" };
        document.getElementById('q-feedback')?.classList.add('hidden');
        document.getElementById('counter')?.classList.add('hidden');
        document.getElementById('btn-arriesgando')?.classList.remove('active');
        document.getElementById('btn-salir')?.classList.add('hidden');
    },

    registrarError: async (preguntaId, testId) => {
        try {
            // Usamos maybeSingle para que no de error en consola si es el primer fallo
            const { data: ex, error } = await sb.from('errores').select('id, veces_fallada').eq('pregunta_id', preguntaId).maybeSingle();
            
            if (error) throw error;

            if (ex) {
                // Si ya existe, sumamos 1 y actualizamos fecha
                await sb.from('errores').update({ 
                    veces_fallada: ex.veces_fallada + 1, 
                    ultimo_fallo: new Date().toISOString() 
                }).eq('id', ex.id);
            } else {
                // Si es nuevo, forzamos el valor 1 y la fecha actual
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
            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.render();
        } catch (err) { alert(err.message); }
    },

    render: () => {
        const item = state.q[state.cur];
        state.status = 'waiting';
        state.arriesgando = false;
        document.getElementById('btn-arriesgando').classList.remove('active');
        document.getElementById('counter').innerText = `Pregunta ${state.cur + 1}/${state.q.length}`;
        document.getElementById('counter').classList.remove('hidden');
        
        // CORREGIDO: Se usa 'item', se incluye el número y se mantiene el título del test
        document.getElementById('q-enunciado').innerHTML = `<div style="font-size: 0.6em; color: #888; margin-bottom: 5px; text-transform: uppercase;">${state.currentTestName}</div>${state.cur + 1}. ${item.enunciado}`;

        // --- BLOQUE NUEVO (CORREGIDO) ---
        const imgEl = document.getElementById('question-img');
        if (item.imagen_url) { // Cambiado 'q' por 'item'
            imgEl.src = item.imagen_url;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.classList.add('hidden');
            imgEl.src = ''; 
        }
        // --- FIN BLOQUE ---
        
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
                btn.innerText = `${l.toUpperCase()}) ${item['opcion_'+l]}`;
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
    },

    siguiente: () => {
        // En modo EXAMEN, guardamos el fallo justo antes de pasar a la siguiente
        if (state.mode === 'examen') {
            const item = state.q[state.cur];
            const res = state.ans[state.cur];
            const correcta = item.correcta.toLowerCase();
            
            // Si no contestó o la respuesta es incorrecta, registramos YA el error
            if (!res || res.letra !== correcta) {
                app.registrarError(item.id, item.test_id);
            }
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

        // Inyectamos la nueva estructura de tarjeta con las clases CSS
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
        if (state.currentTestId) {
            await sb.from('intentos').insert([{ test_id: state.currentTestId, aciertos: aciertos, fallos: fallos, arriesgadas: arriesgadas }]);
        }
    },

    renderRevision: () => {
        const container = document.getElementById('revision-list');
        const html = state.q.map((p, i) => {
            const res = state.ans[i];
            const esCorrecta = res && res.letra === p.correcta.toLowerCase();
            if (esCorrecta && (!res || !res.arriesgada)) return '';
            
            // Esta es la variable que definimos
            let uCol = res ? (esCorrecta ? "#ff9800" : "var(--red)") : "var(--text)";
            
            return `
                <div class="rev-item" style="border-left: 5px solid ${esCorrecta ? 'var(--green)' : 'var(--red)'}; padding: 15px; margin-bottom: 15px; background: rgba(255,255,255,0.03); text-align: left; border-radius: 4px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: ${esCorrecta ? 'var(--green)' : 'var(--red)'}">
                        ${esCorrecta ? '✅ ACERTADA (CON DUDA)' : '❌ FALLO'}
                    </div>
                    <div style="margin-bottom: 12px; font-size: 1.05em;">${p.enunciado}</div>
                    
                    <div style="font-size: 0.95em; margin-bottom: 5px;">
                        <span style="opacity: 0.8;">Tu respuesta:</span> 
                        <strong style="color: ${uCol};"> ${res ? res.letra.toUpperCase() + ') ' + p['opcion_' + res.letra] : 'No contestada'}
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
            sb.from('intentos').select('*'),
            sb.from('tests').select('id, nombre, identificador, temas(nombre, bloque_id)'),
            sb.from('bloques').select('id, nombre')
        ]);

        if (intentosRes.error || testsRes.error || bloquesRes.error) throw new Error("Error de red");
        
        const intentos = intentosRes.data;
        const todosLosTests = testsRes.data;
        const todosLosBloques = bloquesRes.data;

        if (!intentos || intentos.length === 0) {
            listBloques.innerHTML = "<p>No hay datos todavía. ¡Haz un test!</p>"; 
            return;
        }

        // Cálculos Globales
        const tPreg = intentos.reduce((a, c) => a + (c.aciertos + c.fallos), 0);
        const tOk = intentos.reduce((a, c) => a + c.aciertos, 0);
        document.getElementById('stat-total-preguntas').innerText = tPreg;
        document.getElementById('stat-acierto-global').innerText = `${((tOk/tPreg)*100).toFixed(1)}%`;
        const fechas = [...new Set(intentos.map(i => i.fecha?.split('T')[0]))].length;
        document.getElementById('stat-racha').innerText = fechas;

        const statsMap = {};
        intentos.forEach(i => {
            const testInfo = todosLosTests.find(t => t.id === i.test_id);
            if (!testInfo) return;

            const bId = testInfo.temas?.bloque_id || 0; 
            const bloqueNombre = todosLosBloques.find(b => b.id === bId)?.nombre || "OTROS / VARIOS";
            
            if (!statsMap[bId]) {
                statsMap[bId] = { nombre: bloqueNombre, ok: 0, tot: 0, tests: {} };
            }

            statsMap[bId].tot += (i.aciertos + i.fallos);
            statsMap[bId].ok += i.aciertos;

            if (!statsMap[bId].tests[i.test_id]) {
                statsMap[bId].tests[i.test_id] = { 
                    nombre: testInfo.nombre, 
                    identificador: testInfo.identificador,
                    ok: 0, tot: 0 
                };
            }
            statsMap[bId].tests[i.test_id].tot += (i.aciertos + i.fallos);
            statsMap[bId].tests[i.test_id].ok += i.aciertos;
        });

        // RENDERIZADO CON ORDENACIÓN ESPECIAL
        listBloques.innerHTML = Object.keys(statsMap)
            .sort((a, b) => {
                // Si el nombre contiene "EXÁMENES", lo mandamos al final (peso infinito)
                const nameA = statsMap[a].nombre.toUpperCase();
                const nameB = statsMap[b].nombre.toUpperCase();
                if (nameA.includes("EXÁMENES") || nameA.includes("SIMULACRO")) return 1;
                if (nameB.includes("EXÁMENES") || nameB.includes("SIMULACRO")) return -1;
                return a - b; // Por defecto, orden numérico de ID de bloque
            })
            .map(bId => {
                const s = statsMap[bId];
                const pBloque = ((s.ok / s.tot) * 100).toFixed(0);
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
                            ${Object.keys(s.tests).map(tId => {
                                const t = s.tests[tId];
                                const pTest = ((t.ok / t.tot) * 100).toFixed(0);
                                return `
                                    <div class="test-row" onclick="app.start(${tId})" style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.02); margin: 4px 0; border-bottom: 1px solid #30363d;">
                                        <div style="font-size:0.9em;">
                                            <span class="tag-id">${t.identificador || 'TEST'}</span>
                                            <strong>${t.nombre}</strong>
                                        </div>
                                        <span style="font-weight:bold; color:${pTest >= 70 ? 'var(--green)' : '#888'}">${pTest}%</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </details>
                `;
            }).join('');

    } catch (err) { 
        console.error(err); 
        listBloques.innerHTML = "<p style='color:var(--red)'>Error al cargar estadísticas.</p>"; 
    }
},

    confirmarSalida: () => { if(confirm("¿Deseas salir al menú principal?")) location.reload(); }
};

window.onload = app.init;
