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
    currentTestName: "",
    currentIntentoId: null, // <--- NUEVO: Para seguir el rastro del intento actual
    bloquesCache: null, // <--- NUEVO: Para guardar la info de temas
    testsCache: null,   // <--- NUEVO: Para guardar la info de tests
    timerInterval: null, // <--- NUEVO: Para guardar la referencia del intervalo
    seconds: 0          // <--- NUEVO: Para contar los segundos
};

const app = {

    // --- FUNCIONES DEL CRONÓMETRO ---
    startTimer: () => {
        app.stopTimer(); // Seguridad: limpiar cualquier timer previo
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

            // --- CAMBIO: Traemos tests, bloques Y AHORA TAMBIÉN INTENTOS CON EL CAMPO COMPLETADO ---
            const [testsRes, bloquesRes, intentosRes] = await Promise.all([
                sb.from('tests').select(`id, nombre, tipo, identificador, visible, temas (nombre, bloque_id)`).eq('visible', true),
                sb.from('bloques').select('id, nombre'),
                sb.from('intentos').select('test_id, completado') // <--- CAMBIO: Pedimos también 'completado'
            ]);
            
            if (testsRes.error) throw testsRes.error;
            const tests = testsRes.data;
            const nombresBloques = bloquesRes.data || [];

            state.testsCache = tests;
            state.bloquesCache = nombresBloques;
            
            // --- CAMBIO: Filtramos solo los que tengan completado: true para el check verde ---
            const testsHechos = new Set((intentosRes.data || []).filter(i => i.completado).map(i => i.test_id));

            // 1. OFICIALES
            const oficiales = tests.filter(t => t.tipo === 'examen_simulacro');
            // --- ÚNICO CAMBIO: ORDENAR ALFABÉTICAMENTE ---
            oficiales.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
            // ---------------------------------------------
            document.getElementById('list-oficiales').innerHTML = oficiales.map(t => `
                <div class="test-row oficial-row" onclick="app.start(${t.id})">
                    <span class="badge-blue">${t.identificador || 'OFICIAL'}</span>
                    <strong>${t.nombre}${testsHechos.has(t.id) ? ' ✅' : ''}</strong> 
                </div>`).join(''); 

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
    }, 

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
            app.startTimer(); // <--- INICIAMOS CRONÓMETRO
            app.render();
        } catch (error) { console.error(error); }
    },

    resetState: () => {
        app.stopTimer(); // <--- NUEVO: Detenemos el reloj aquí
        state = { q: [], cur: 0, ans: [], mode: 'estudio', status: 'waiting', arriesgando: false, currentTestId: null, currentTestName: "", currentIntentoId: null };
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
            
            // --- NUEVO: Creamos el intento al inicio ---
            const { data: intento, error: errorIntento } = await sb.from('intentos').insert([{ 
                test_id: testId, 
                aciertos: 0, 
                fallos: 0, 
                arriesgadas: 0
                // completado: false (por defecto en BD)
            }]).select().single();
            
            if (errorIntento) throw errorIntento;
            state.currentIntentoId = intento.id;
            // --- FIN NUEVO ---

            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer(); // <--- AQUÍ INICIAMOS EL CRONÓMETRO
            app.render();
        } catch (err) { alert(err.message); }
    },

    // --- VERSIÓN DE DEPURACIÓN ---
    /*actualizarIntento: async () => {
        if (!state.currentIntentoId) {
            console.warn("⚠️ No hay ID de intento, no se puede guardar.");
            return;
        }

        // 1. Verificamos qué estamos calculando
        const aciertos = state.ans.filter((a, i) => a && a.letra === state.q[i].correcta.toLowerCase()).length;
        const arriesgadas = state.ans.filter(a => a && a.arriesgada).length;
        const fallos = state.ans.filter((a, i) => a && a.letra !== state.q[i].correcta.toLowerCase()).length;
        
        console.log(`📝 Intentando actualizar ID: ${state.currentIntentoId}`);
        console.log(`📊 Datos calculados -> Aciertos: ${aciertos}, Fallos: ${fallos}`);

        // 2. Intentamos enviar a Supabase y LEEMOS el error si lo hay
        const { data, error } = await sb.from('intentos').update({ 
            aciertos, fallos, arriesgadas 
        }).eq('id', state.currentIntentoId).select();

        if (error) {
            console.error("❌ ERROR CRÍTICO AL GUARDAR EN SUPABASE:", error);
            alert("Error de base de datos: Mira la consola (F12)");
        } else {
            console.log("✅ Supabase respondió OK:", data);
        }
    },*/

    // --- NUEVA FUNCIÓN AUXILIAR: Actualiza progreso parcial ---
    actualizarIntento: async () => {
        if (!state.currentIntentoId) return;
        const aciertos = state.ans.filter((a, i) => a && a.letra === state.q[i].correcta.toLowerCase()).length;
        const arriesgadas = state.ans.filter(a => a && a.arriesgada).length;
        // En progreso parcial, solo contamos los fallos reales (respuestas incorrectas), no las preguntas sin contestar
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
        
        // --- NUEVO: Actualizamos progreso en BD ---
        await app.actualizarIntento();
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
            // --- NUEVO: Actualizamos progreso en BD ---
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
        
        // --- NUEVO: Actualizamos el intento existente y lo marcamos como completado ---
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
            // 1. Obtención de datos (Filtramos completado:true en JS para evitar errores de query)
            const [intentosRes, testsRes, bloquesRes] = await Promise.all([
                sb.from('intentos').select('*').order('id', { ascending: false }), // Traemos de más reciente a más antiguo
                sb.from('tests').select('id, nombre, identificador, temas(nombre, bloque_id)'), 
                sb.from('bloques').select('id, nombre')
            ]);
    
            if (intentosRes.error || testsRes.error || bloquesRes.error) throw new Error("Error de red");
            
            // Filtramos solo intentos completados en JavaScript
            const todosLosIntentos = (intentosRes.data || []).filter(i => i.completado);
            const todosLosTests = testsRes.data || [];
            const todosLosBloques = bloquesRes.data || [];
    
            if (todosLosIntentos.length === 0) {
                listBloques.innerHTML = "<p style='text-align:center; padding:20px; opacity:0.6;'>No hay datos todavía. ¡Completa un test!</p>"; 
                return;
            }
    
            // 2. Lógica de "Foto Actual": Quedarnos solo con el último intento de cada Test ID
            const ultimosIntentosPorTest = {};
            todosLosIntentos.forEach(intento => {
                if (!ultimosIntentosPorTest[intento.test_id]) {
                    ultimosIntentosPorTest[intento.test_id] = intento;
                }
            });

            // 3. Agrupación por Bloque para medias aritméticas
            const statsMap = {};
    
            Object.values(ultimosIntentosPorTest).forEach(i => {
                const testInfo = todosLosTests.find(t => t.id === i.test_id);
                if (!testInfo) return;
    
                const bId = testInfo.temas?.bloque_id || 0; 
                const bloqueNombre = todosLosBloques.find(b => b.id === bId)?.nombre || "OTROS / VARIOS";
                
                if (!statsMap[bId]) {
                    statsMap[bId] = { nombre: bloqueNombre, porcentajesTests: [], testsDetalle: [] };
                }

                // Cálculo de porcentaje individual del test
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
    
            // 4. Cálculo de Globales (Media de todos los tests únicos realizados)
            const todosLosPorcentajes = Object.values(statsMap).flatMap(b => b.porcentajesTests);
            const porcentajeGlobal = (todosLosPorcentajes.reduce((a, b) => a + b, 0) / todosLosPorcentajes.length).toFixed(1);
            const totalRespondidasGlobal = todosLosIntentos.reduce((a, c) => a + (c.aciertos + c.fallos), 0);
            const diasEstudiados = [...new Set(todosLosIntentos.map(i => i.fecha?.split('T')[0]))].filter(Boolean).length;
    
            document.getElementById('stat-total-preguntas').innerText = totalRespondidasGlobal;
            document.getElementById('stat-acierto-global').innerText = `${porcentajeGlobal}%`;
            document.getElementById('stat-racha').innerText = diasEstudiados;
    
            // 5. Renderizado de la lista
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
                    // Media aritmética del bloque: suma de % / cantidad de tests hechos en ese bloque
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
            // Ahora, con las políticas RLS creadas, esto funcionará
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

    // --- NUEVAS FUNCIONES PARA REPASO POR TEMA ---

   abrirModalRepasoTema: () => {
        const listContainer = document.getElementById('lista-temas-repaso');
        listContainer.innerHTML = "";
        
        if(!state.bloquesCache || !state.testsCache) return alert("Espera a que carguen los datos.");

        // 1. ORDENAMOS LOS BLOQUES ANTES DE PINTARLOS
        const bloquesOrdenados = [...state.bloquesCache].sort((a, b) => {
            const nombreA = a.nombre.toUpperCase();
            const nombreB = b.nombre.toUpperCase();

            // Detectar si son bloques especiales (Exámenes/Simulacros) para enviarlos al final
            const esExamenA = nombreA.includes("OFICIAL") || nombreA.includes("SIMULACRO") || nombreA.includes("EXÁMENES") || nombreA.includes("EXAMEN");
            const esExamenB = nombreB.includes("OFICIAL") || nombreB.includes("SIMULACRO") || nombreB.includes("EXÁMENES") || nombreB.includes("EXAMEN");

            // Regla: Los exámenes siempre al final (return 1)
            if (esExamenA && !esExamenB) return 1;
            if (!esExamenA && esExamenB) return -1;

            // Regla: Para bloques normales, orden numérico (Bloque 1 antes que Bloque 2)
            return nombreA.localeCompare(nombreB, undefined, { numeric: true });
        });

        // 2. Iteramos sobre la lista ya ordenada
        bloquesOrdenados.forEach(bloque => {
            const testsDelBloque = state.testsCache.filter(t => t.temas && t.temas.bloque_id === bloque.id);
            
            if (testsDelBloque.length === 0) return;

            const esBloqueExamenes = bloque.nombre.toLowerCase().includes('exámenes') || bloque.nombre.toLowerCase().includes('simulacros');

            const container = document.createElement('div');
            container.className = 'bloque-container';

            const header = document.createElement('div');
            header.className = 'bloque-header';
            header.innerHTML = `<span>📦 ${bloque.nombre}</span> <span>▼</span>`;
            
            const listaTemasDiv = document.createElement('div');
            listaTemasDiv.className = 'temas-lista';

            header.onclick = () => {
                document.querySelectorAll('.temas-lista').forEach(el => {
                    if(el !== listaTemasDiv) el.classList.remove('open');
                });
                listaTemasDiv.classList.toggle('open');
            };

            if (esBloqueExamenes) {
                // ESTRATEGIA A: Tests individuales
                testsDelBloque.forEach(test => {
                    const btnTest = document.createElement('button');
                    btnTest.className = 'btn-tema-subitem';
                    btnTest.innerHTML = `📝 ${test.nombre}`; 
                    btnTest.onclick = () => {
                        document.getElementById('modal-temas').classList.add('hidden');
                        app.prepararRepasoPorTestId(test.id, test.nombre);
                    };
                    listaTemasDiv.appendChild(btnTest);
                });

            } else {
                // ESTRATEGIA B: Temas agrupados
                const nombresTemasUnicos = [...new Set(testsDelBloque.map(t => t.temas.nombre))];
                
                // Ordenamos también los temas alfabéticamente dentro del bloque
                nombresTemasUnicos.sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));

                nombresTemasUnicos.forEach(nombreTema => {
                    const btnTema = document.createElement('button');
                    btnTema.className = 'btn-tema-subitem';
                    btnTema.innerHTML = `• ${nombreTema}`;
                    
                    // --- AQUÍ ESTABA EL ERROR: USAMOS TU NOMBRE DE FUNCIÓN REAL ---
                    btnTema.onclick = () => {
                        document.getElementById('modal-temas').classList.add('hidden');
                        app.prepararRepasoPorNombreTema(nombreTema);
                    };
                    listaTemasDiv.appendChild(btnTema);
                });
            }

            container.appendChild(header);
            container.appendChild(listaTemasDiv);
            listContainer.appendChild(container);
        });

        document.getElementById('modal-temas').classList.remove('hidden');
    },

    prepararRepasoPorNombreTema: async (nombreTema) => {
        try {
            // 1. ANTES DE RESETEAR: Guardamos referencias a los datos
            // Si reseteamos primero, perdemos 'state.testsCache' y explota todo.
            const backupTests = state.testsCache;
            const backupBloques = state.bloquesCache;

            // 2. Buscamos los tests de este tema ANTES de limpiar nada
            // Usamos '?.' para evitar errores si 'temas' viene vacío
            const testsDelTema = backupTests.filter(t => t.temas?.nombre === nombreTema);
            const testIds = testsDelTema.map(t => t.id);

            if (testIds.length === 0) return alert("Error: No se encontraron tests para este tema.");

            // 3. Ahora sí limpiamos la pantalla...
            app.resetState();

            // 4. ...Y RESTAURAMOS LA CACHÉ INMEDIATAMENTE para que el botón siga funcionando
            state.testsCache = backupTests;
            state.bloquesCache = backupBloques;

            // 5. Buscamos errores SOLO de esos tests
            const { data: errores, error } = await sb
                .from('errores')
                .select('pregunta_id, veces_fallada, test_id')
                .in('test_id', testIds) 
                .order('veces_fallada', { ascending: false })
                .limit(30);

            if (error) throw error;

            // --- AQUÍ GESTIONAMOS SI NO HAY FALLOS ---
            if (!errores || errores.length === 0) {
                // Volvemos a la pantalla de menú porque no se puede iniciar test
                app.switchView('view-menu'); 
                return alert(`No tienes fallos registrados en el tema: "${nombreTema}".`);
            }

            // 6. Cargar las preguntas
            const idsPreguntas = errores.map(e => e.pregunta_id);
            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
            
            if (errP) throw errP;

            // 7. Iniciar Test
            state.q = preguntas;
            state.currentTestName = `🎯 REPASO: ${nombreTema}`;
            state.mode = 'estudio'; 
            
            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer(); // <--- ¡AÑÁDELO AQUÍ!
            app.render();

        } catch (err) {
            console.error("Error repaso tema:", err);
            alert("Error al cargar el repaso. Revisa la consola.");
            // Si falla, intentamos restaurar caché por seguridad
            if(!state.testsCache && typeof tests !== 'undefined') state.testsCache = tests;
        }
    },

    // --- NUEVA FUNCIÓN PARA REPASAR UN EXAMEN/SIMULACRO CONCRETO ---
    prepararRepasoPorTestId: async (testId, nombreTest) => {
        try {
            // 1. Copia de seguridad
            const backupTests = state.testsCache;
            const backupBloques = state.bloquesCache;

            // 2. Limpieza
            app.resetState();

            // 3. Restauración
            state.testsCache = backupTests;
            state.bloquesCache = backupBloques;

            // 4. Búsqueda de errores (Directamente por test_id, mucho más fácil)
            const { data: errores, error } = await sb
                .from('errores')
                .select('pregunta_id, veces_fallada, test_id')
                .eq('test_id', testId) // <--- Aquí está la clave: un solo ID
                .order('veces_fallada', { ascending: false })
                .limit(30);

            if (error) throw error;

            if (!errores || errores.length === 0) {
                app.switchView('view-menu');
                return alert(`No tienes fallos registrados en: "${nombreTest}".`);
            }

            // 5. Cargar preguntas
            const idsPreguntas = errores.map(e => e.pregunta_id);
            const { data: preguntas, error: errP } = await sb.from('preguntas').select('*').in('id', idsPreguntas);
            
            if (errP) throw errP;

            // 6. Iniciar
            state.q = preguntas;
            state.currentTestName = `🎯 REPASO: ${nombreTest}`;
            state.mode = 'estudio'; 
            
            app.switchView('view-test');
            document.getElementById('btn-salir').classList.remove('hidden');
            app.startTimer(); // <--- ¡AÑÁDELO AQUÍ!
            app.render();

        } catch (err) {
            console.error("Error repaso examen:", err);
            alert("Error al cargar el repaso del examen.");
            // Restauración de emergencia
            if(!state.testsCache && typeof tests !== 'undefined') state.testsCache = tests;
        }
    },

};

window.onload = app.init;

// --- CONTROLADOR DE TECLADO GLOBAL ---
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
        
        // 2. Barra espaciadora para Corregir / Siguiente
        if (e.code === 'Space') {
            e.preventDefault(); // Evita que la página haga scroll al pulsar espacio
            const btnAccion = document.getElementById('btn-accion');
            if (btnAccion && !btnAccion.disabled) {
                btnAccion.click();
            }
        }
    }
});