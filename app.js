// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://tvjadtkhjbbttszairxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI3MDMsImV4cCI6MjEwMjY2ODcwM30.-5QfzCMPIzO7rV8CqTlnNkyWkoVGFnMwMYqDKDBzJXQ';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA5MjcwMywiZXhwIjoyMTAyNjY4NzAzfQ.C_IUxWSEuFpy72jo2-aQORUSZdNPPtuC1Xk7EYqId30'; // Usada apenas para gerenciar os usuários!

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _adminAuth = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let usuarioAtual = null;
let perfilAtual = null;
let html5QrcodeScanner = null;
let listaCacheLivros = [];
let carrinhoAtual = [];

// --- TEMA (MODO NOTURNO) ---
function toggleDarkMode() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('tema', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('tema', 'dark');
    }
}
if (localStorage.getItem('tema') === 'dark') document.documentElement.classList.add('dark');

// --- AUTENTICAÇÃO E PERFIS ---
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        document.getElementById('auth-msg').innerText = "Erro ao entrar. Verifique os dados.";
    } else {
        await iniciarSessao(data.user);
    }
}

async function iniciarSessao(user) {
    usuarioAtual = user;
    
    const { data, error } = await _supabase.from('perfis').select('role').eq('id', user.id).single();
    if (error) console.error("Erro ao buscar perfil:", error);

    perfilAtual = data ? data.role : 'normal';
    
    // Mostra crachá bonito do usuário
    const roleFormatado = perfilAtual === 'master' ? '👑 Master' : '👤 Vendedor';
    document.getElementById('user-info').innerText = `${user.email.split('@')[0]} | ${roleFormatado}`;
    
    document.querySelectorAll('.master-only').forEach(el => {
        el.style.display = perfilAtual === 'master' ? 'flex' : 'none'; // usa flex por causa do design novo
    });

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    mudarAba('vendas', 'Frente de Caixa'); 
    carregarDadosGlobais();
    iniciarTempoReal();
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

_supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) iniciarSessao(session.user);
});

// --- TEMPO REAL ---
function iniciarTempoReal() {
    _supabase.channel('tabelas-gerais')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'livros' }, payload => {
            carregarDadosGlobais();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes' }, payload => {
            carregarVendasHoje();
        })
        .subscribe();
}

// --- CONTROLE DE ABAS (Atualizado Visualmente) ---
function mudarAba(abaId, titulo) {
    // Agora o normal não acessa apenas cadastrar e usuarios. Relatorios está liberado!
    if (perfilAtual !== 'master' && ['cadastrar', 'usuarios'].includes(abaId)) return;

    document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${abaId}`).classList.remove('hidden');
    document.getElementById('titulo-aba').innerText = titulo;

    // Reset visual dos botões
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-900/40');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    
    // Destaca o botão ativo de forma elegante
    const btnAtivo = document.getElementById(`btn-${abaId}`);
    if(btnAtivo) {
        btnAtivo.classList.remove('text-slate-500', 'dark:text-slate-400');
        btnAtivo.classList.add('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-900/40');
    }

    if (abaId === 'usuarios') carregarUsuarios();
}

// --- BANCO DE DADOS GERAL ---
async function carregarDadosGlobais() {
    const { data } = await _supabase.from('livros').select('*').order('titulo', { ascending: true });
    if (data) listaCacheLivros = data;
    
    renderizarEstoqueGeral();
    carregarVendasHoje();
}

// --- ESTOQUE (Design Atualizado) ---
function renderizarEstoqueGeral() {
    const termo = (document.getElementById('filtro-estoque') ? document.getElementById('filtro-estoque').value.toLowerCase() : '');
    const divEstoque = document.getElementById('lista-estoque-geral');
    if(!divEstoque) return;
    
    divEstoque.innerHTML = '';
    const filtrados = listaCacheLivros.filter(l => l.titulo.toLowerCase().includes(termo) || (l.isbn && l.isbn.includes(termo)));
    
    if(filtrados.length === 0) {
        divEstoque.innerHTML = '<div class="text-center p-8 text-slate-400">Nenhum livro encontrado.</div>';
        return;
    }

    filtrados.forEach(l => {
        const bgBadge = l.quantidade > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
        
        const botoesAcao = perfilAtual === 'master' ? `
            <div class="flex gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button onclick="abrirModal(${l.id}, '${l.titulo.replace(/'/g, "")}', ${l.preco}, ${l.quantidade})" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 px-4 py-2 rounded-xl text-sm font-semibold flex-1 transition-colors">Editar</button>
                <button onclick="excluirLivro(${l.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50 px-4 py-2 rounded-xl text-sm font-semibold flex-1 transition-colors">Excluir</button>
            </div>
        ` : '';

        divEstoque.innerHTML += `
            <div class="p-5 border border-slate-200 rounded-2xl bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-1">
                    <p class="font-bold text-slate-800 dark:text-slate-100 text-lg leading-tight pr-4">${l.titulo}</p>
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${bgBadge} whitespace-nowrap">${l.quantidade} un.</span>
                </div>
                <p class="text-xs text-slate-400 dark:text-slate-500 mb-2">ISBN: ${l.isbn || '-'}</p>
                <p class="text-lg text-indigo-600 dark:text-indigo-400 font-bold">R$ ${Number(l.preco).toFixed(2)}</p>
                ${botoesAcao}
            </div>`;
    });
}

function filtrarEstoque() { renderizarEstoqueGeral(); }

// --- CADASTRO E EDIÇÃO ---
async function salvarLivro() {
    if (perfilAtual !== 'master') return;
    const isbn = document.getElementById('cad-isbn').value;
    const titulo = document.getElementById('cad-titulo').value;
    const preco = parseFloat(document.getElementById('cad-preco').value);
    const qtd = parseInt(document.getElementById('cad-qtd').value);

    if(!isbn || !titulo || !preco) return alert("Preencha ISBN, Título e Preço!");

    const { error } = await _supabase.from('livros').insert([{ isbn, titulo, preco, quantidade: isNaN(qtd) ? 0 : qtd }]);
    if (error) alert("Erro: " + error.message);
    else {
        alert("Livro cadastrado!");
        document.getElementById('cad-isbn').value = ''; document.getElementById('cad-titulo').value = '';
        document.getElementById('cad-preco').value = ''; document.getElementById('cad-qtd').value = '';
    }
}

function abrirModal(id, titulo, preco, qtd) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-titulo').value = titulo;
    document.getElementById('edit-preco').value = preco;
    document.getElementById('edit-qtd').value = qtd;
    document.getElementById('modal-edicao').classList.remove('hidden');
}
function fecharModal() { document.getElementById('modal-edicao').classList.add('hidden'); }

async function salvarEdicao() {
    const id = document.getElementById('edit-id').value;
    const titulo = document.getElementById('edit-titulo').value;
    const preco = parseFloat(document.getElementById('edit-preco').value);
    const quantidade = parseInt(document.getElementById('edit-qtd').value);

    await _supabase.from('livros').update({ titulo, preco, quantidade }).eq('id', id);
    fecharModal();
}

async function excluirLivro(id) {
    if (confirm("Excluir este livro definitivamente?")) {
        await _supabase.from('livros').delete().eq('id', id);
    }
}

// --- VENDAS & CARRINHO (Design Atualizado) ---
function adicionarAoCarrinhoPorIsbn() {
    const isbn = document.getElementById('venda-isbn').value.trim();
    if (!isbn) return alert("Insira um ISBN!");

    const livro = listaCacheLivros.find(l => l.isbn === isbn);
    if (!livro) return alert("Livro não encontrado!");
    if (livro.quantidade <= 0) return alert("Esgotado!");

    const itemExistente = carrinhoAtual.find(i => i.id === livro.id);
    if (itemExistente) {
        if (itemExistente.qtd < livro.quantidade) itemExistente.qtd++;
        else alert("Estoque máximo atingido!");
    } else {
        carrinhoAtual.push({ id: livro.id, titulo: livro.titulo, preco: livro.preco, qtd: 1, estoqueMax: livro.quantidade });
    }
    document.getElementById('venda-isbn').value = '';
    renderizarCarrinho();
}

function alterarQtdCarrinho(id, delta) {
    const item = carrinhoAtual.find(i => i.id === id);
    if (item) {
        item.qtd += delta;
        if (item.qtd <= 0) carrinhoAtual = carrinhoAtual.filter(i => i.id !== id);
        else if (item.qtd > item.estoqueMax) { item.qtd = item.estoqueMax; alert("Limite de estoque!"); }
        renderizarCarrinho();
    }
}

function renderizarCarrinho() {
    const div = document.getElementById('lista-carrinho');
    div.innerHTML = '';
    if (carrinhoAtual.length === 0) {
        div.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">A cesta está vazia.</p>';
        document.getElementById('carrinho-total').innerText = 'R$ 0,00';
        return;
    }
    let totalGeral = 0;
    carrinhoAtual.forEach(item => {
        const subtotal = item.preco * item.qtd;
        totalGeral += subtotal;
        div.innerHTML += `
            <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <div class="flex-1 pr-2">
                    <p class="font-semibold text-slate-700 dark:text-slate-200 text-sm leading-tight mb-1">${item.titulo}</p>
                    <p class="text-xs text-slate-500">R$ ${Number(item.preco).toFixed(2)} un</p>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden shadow-sm">
                        <button onclick="alterarQtdCarrinho('${item.id}', -1)" class="px-3 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors font-bold">-</button>
                        <span class="px-2 text-sm font-bold w-6 text-center">${item.qtd}</span>
                        <button onclick="alterarQtdCarrinho('${item.id}', 1)" class="px-3 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors font-bold">+</button>
                    </div>
                    <span class="font-bold text-indigo-600 dark:text-indigo-400 w-16 text-right">R$ ${subtotal.toFixed(2)}</span>
                </div>
            </div>`;
    });
    document.getElementById('carrinho-total').innerText = `R$ ${totalGeral.toFixed(2)}`;
}

async function finalizarVenda() {
    if (carrinhoAtual.length === 0) return alert("Cesta vazia!");

    const seq = Math.floor(Date.now() / 1000); 
    let total = 0;

    for (const item of carrinhoAtual) {
        total += item.preco * item.qtd;
        await _supabase.from('livros').update({ quantidade: item.estoqueMax - item.qtd }).eq('id', item.id);
        await _supabase.from('movimentacoes').insert([{
            livro_id: item.id, tipo: 'venda', quantidade: item.qtd, valor_total: item.preco * item.qtd,
            codigo_venda: seq, cliente_nome: document.getElementById('cli-nome').value || null, cliente_email: document.getElementById('cli-email').value || null
        }]);
    }

    alert(`✅ Venda Concluída!\n\nNúmero do Pedido: #${seq}\nValor Total: R$ ${total.toFixed(2)}`);
    carrinhoAtual = [];
    document.getElementById('cli-nome').value = ''; document.getElementById('cli-email').value = '';
    renderizarCarrinho();
}

async function carregarVendasHoje() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const { data } = await _supabase.from('movimentacoes').select('valor_total').eq('tipo', 'venda').gte('data_hora', hoje.toISOString());
    const total = data ? data.reduce((soma, m) => soma + Number(m.valor_total), 0) : 0;
    document.getElementById('vendas-hoje').innerText = `R$ ${total.toFixed(2)}`;
}

// --- RELATÓRIOS EXCEL (Agora livre para todos) ---
async function exportarExcel(periodo) {
    const agora = new Date(); let limite = new Date();
    if (periodo === 'diario') limite.setHours(0,0,0,0);
    else if (periodo === 'semanal') limite.setDate(agora.getDate() - 7);
    else if (periodo === 'mensal') limite.setMonth(agora.getMonth() - 1);

    const { data, error } = await _supabase.from('movimentacoes').select(`codigo_venda, quantidade, valor_total, data_hora, cliente_nome, cliente_email, livros (titulo, isbn)`).eq('tipo', 'venda').gte('data_hora', limite.toISOString());

    if (error || !data || data.length === 0) return alert("Nenhuma venda no período.");

    const formato = data.map(m => ({
        'Nº Venda': m.codigo_venda, 'Data': new Date(m.data_hora).toLocaleString('pt-BR'), 'Livro': m.livros ? m.livros.titulo : 'Removido',
        'Qtd': m.quantidade, 'Total (R$)': Number(m.valor_total), 'Cliente': m.cliente_nome || '-', 'Email': m.cliente_email || '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(formato);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");
    XLSX.writeFile(wb, `relatorio_${periodo}.xlsx`);
}

// --- GERENCIAMENTO DE USUÁRIOS (Apenas Master) ---
async function carregarUsuarios() {
    if (perfilAtual !== 'master') return;
    const { data } = await _supabase.from('perfis').select('*').order('email');
    const div = document.getElementById('lista-usuarios');
    div.innerHTML = '';
    
    data.forEach(user => {
        const isMaster = user.role === 'master';
        const roleCor = isMaster ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        
        div.innerHTML += `
            <div class="flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-700 rounded-2xl gap-3">
                <div>
                    <p class="font-bold text-slate-800 dark:text-slate-200">${user.email}</p>
                    <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${roleCor}">${isMaster ? '👑 MASTER' : '👤 NORMAL'}</span>
                </div>
                <div class="flex gap-2 w-full sm:w-auto">
                    <button onclick="mudarRoleUsuario('${user.id}', '${isMaster ? 'normal' : 'master'}')" class="flex-1 sm:flex-none bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                        Tornar ${isMaster ? 'Normal' : 'Master'}
                    </button>
                    <button onclick="excluirUsuarioAuth('${user.id}')" class="flex-1 sm:flex-none bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors">
                        Excluir
                    </button>
                </div>
            </div>`;
    });
}

async function criarUsuario() {
    const email = document.getElementById('novo-user-email').value;
    const password = document.getElementById('novo-user-senha').value;
    const role = document.getElementById('novo-user-role').value;

    if(password.length < 6) return alert("Senha mínima de 6 caracteres.");

    const { data, error } = await _adminAuth.auth.admin.createUser({ email, password, email_confirm: true });
    
    if (error) alert("Erro: " + error.message);
    else {
        await _supabase.from('perfis').update({ role }).eq('id', data.user.id);
        alert("Usuário criado com sucesso!");
        document.getElementById('novo-user-email').value = '';
        document.getElementById('novo-user-senha').value = '';
        carregarUsuarios();
    }
}

async function mudarRoleUsuario(id, novaRole) {
    if(id === usuarioAtual.id) return alert("Você não pode rebaixar a si mesmo!");
    await _supabase.from('perfis').update({ role: novaRole }).eq('id', id);
    carregarUsuarios();
}

async function excluirUsuarioAuth(id) {
    if(id === usuarioAtual.id) return alert("Você não pode excluir sua própria conta!");
    if(confirm("ATENÇÃO: Excluir definitivamente este usuário?")) {
        await _adminAuth.auth.admin.deleteUser(id);
        carregarUsuarios();
    }
}

// --- CÂMERA (QR/BARCODE) ---
function iniciarCamera(modo) {
    const elementoId = modo === 'cadastro' ? 'reader-cadastro' : 'reader-venda';
    if(html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
    html5QrcodeScanner = new Html5QrcodeScanner(elementoId, { fps: 10, qrbox: {width: 250, height: 150} }, false);
    html5QrcodeScanner.render(async (texto) => {
        html5QrcodeScanner.clear(); html5QrcodeScanner = null;
        if (modo === 'cadastro') {
            document.getElementById('cad-isbn').value = texto;
            const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${texto}`);
            const dados = await res.json();
            if (dados.items && dados.items.length > 0) document.getElementById('cad-titulo').value = dados.items[0].volumeInfo.title;
        } else {
            document.getElementById('venda-isbn').value = texto;
            adicionarAoCarrinhoPorIsbn();
        }
    }, () => {});
}
