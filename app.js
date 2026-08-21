// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://tvjadtkhjbbttszairxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI3MDMsImV4cCI6MjEwMjY2ODcwM30.-5QfzCMPIzO7rV8CqTlnNkyWkoVGFnMwMYqDKDBzJXQ';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA5MjcwMywiZXhwIjoyMTAyNjY4NzAzfQ.C_IUxWSEuFpy72jo2-aQORUSZdNPPtuC1Xk7EYqId30'; // Usada apenas para gerenciar os usuários!

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// Cliente Admin exclusivo para criar/deletar usuários sem perder a sessão atual
const _adminAuth = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let usuarioAtual = null;
let perfilAtual = null; // 'master' ou 'normal'
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
// Carregar tema salvo
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
    
    // Buscar perfil do banco
    const { data, error } = await _supabase.from('perfis').select('role').eq('id', user.id).single();
    
    // SE DER ERRO, VAI MOSTRAR NO CONSOLE:
    if (error) {
        console.error("Erro ao buscar o perfil no Supabase:", error);
    }

    perfilAtual = data ? data.role : 'normal';
    
    document.getElementById('user-info').innerText = `${user.email} (${perfilAtual.toUpperCase()})`;
    
    // Esconder/Mostrar abas dependendo da hierarquia
    document.querySelectorAll('.master-only').forEach(el => {
        el.style.display = perfilAtual === 'master' ? 'block' : 'none';
    });

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    
    mudarAba('vendas', 'Frente de Caixa'); 
    carregarDadosGlobais();
    iniciarTempoReal();
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload(); // Recarrega a página para limpar tudo
}

// Checar sessão ativa ao abrir o app
_supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) iniciarSessao(session.user);
});

// --- TEMPO REAL (REALTIME SUPABASE) ---
function iniciarTempoReal() {
    _supabase.channel('tabelas-gerais')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'livros' }, payload => {
            carregarDadosGlobais(); // Alguém mexeu no estoque, atualiza a tela
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes' }, payload => {
            carregarVendasHoje(); // Alguém fez venda, atualiza o relatório
        })
        .subscribe();
}

// --- CONTROLE DE ABAS ---
function mudarAba(abaId, titulo) {
    // Bloquear acesso direto se for normal tentando acessar aba de master
    if (perfilAtual !== 'master' && ['cadastrar', 'relatorios', 'usuarios'].includes(abaId)) return;

    document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${abaId}`).classList.remove('hidden');
    document.getElementById('titulo-aba').innerText = titulo;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-blue-600', 'dark:text-blue-400');
        btn.classList.add('text-gray-400');
    });
    const btnAtivo = document.getElementById(`btn-${abaId}`);
    if(btnAtivo) {
        btnAtivo.classList.remove('text-gray-400');
        btnAtivo.classList.add('text-blue-600', 'dark:text-blue-400');
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

// --- ESTOQUE ---
function renderizarEstoqueGeral() {
    const termo = (document.getElementById('filtro-estoque') ? document.getElementById('filtro-estoque').value.toLowerCase() : '');
    const divEstoque = document.getElementById('lista-estoque-geral');
    if(!divEstoque) return;
    
    divEstoque.innerHTML = '';
    const filtrados = listaCacheLivros.filter(l => l.titulo.toLowerCase().includes(termo) || (l.isbn && l.isbn.includes(termo)));
    
    if(filtrados.length === 0) {
        divEstoque.innerHTML = '<p class="text-gray-500 text-center">Nenhum livro encontrado.</p>';
        return;
    }

    filtrados.forEach(l => {
        // Se for master, exibe os botões. Se for normal, esconde.
        const botoesAcao = perfilAtual === 'master' ? `
            <div class="flex gap-1 mt-2">
                <button onclick="abrirModal(${l.id}, '${l.titulo.replace(/'/g, "")}', ${l.preco}, ${l.quantidade})" class="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold w-full">Editar</button>
                <button onclick="excluirLivro(${l.id})" class="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold w-full">Excluir</button>
            </div>
        ` : '';

        divEstoque.innerHTML += `
            <div class="p-3 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm flex flex-col">
                <p class="font-bold text-gray-800 dark:text-gray-200">${l.titulo}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">ISBN: ${l.isbn || '-'}</p>
                <p class="text-sm text-blue-600 dark:text-blue-400 font-semibold mt-1">Estoque: ${l.quantidade} un. | R$ ${Number(l.preco).toFixed(2)}</p>
                ${botoesAcao}
            </div>`;
    });
}

function filtrarEstoque() { renderizarEstoqueGeral(); }

// --- CADASTRO / EDIÇÃO DE LIVROS (MASTER) ---
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

// --- VENDAS & CARRINHO (TODOS) ---
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
        div.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Cesta vazia.</p>';
        document.getElementById('carrinho-total').innerText = 'R$ 0,00';
        return;
    }
    let totalGeral = 0;
    carrinhoAtual.forEach(item => {
        const subtotal = item.preco * item.qtd;
        totalGeral += subtotal;
        div.innerHTML += `
            <div class="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded border dark:border-gray-600 text-xs">
                <div>
                    <p class="font-bold text-gray-800 dark:text-gray-200">${item.titulo}</p>
                    <p class="text-gray-500 dark:text-gray-400">R$ ${Number(item.preco).toFixed(2)} un</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="alterarQtdCarrinho('${item.id}', -1)" class="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded font-bold">-</button>
                    <span class="font-bold dark:text-white">${item.qtd}</span>
                    <button onclick="alterarQtdCarrinho('${item.id}', 1)" class="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded font-bold">+</button>
                    <span class="font-semibold text-blue-600 dark:text-blue-400">R$ ${subtotal.toFixed(2)}</span>
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

    alert(`Venda #${seq} OK!\nCobrar: R$ ${total.toFixed(2)}`);
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

// --- RELATÓRIOS EXCEL (MASTER) ---
async function exportarExcel(periodo) {
    if (perfilAtual !== 'master') return;
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

// --- GERENCIAMENTO DE USUÁRIOS (MASTER) ---
async function carregarUsuarios() {
    if (perfilAtual !== 'master') return;
    const { data } = await _supabase.from('perfis').select('*').order('email');
    const div = document.getElementById('lista-usuarios');
    div.innerHTML = '';
    
    data.forEach(user => {
        div.innerHTML += `
            <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 border dark:border-gray-600 rounded">
                <div>
                    <p class="font-bold text-sm text-gray-800 dark:text-gray-200">${user.email}</p>
                    <p class="text-xs ${user.role === 'master' ? 'text-red-500' : 'text-blue-500'} font-bold">Perfil: ${user.role.toUpperCase()}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="mudarRoleUsuario('${user.id}', '${user.role === 'master' ? 'normal' : 'master'}')" class="bg-yellow-500 text-white px-2 py-1 rounded text-xs font-bold text-center">Tornar ${user.role === 'master' ? 'Normal' : 'Master'}</button>
                    <button onclick="excluirUsuarioAuth('${user.id}')" class="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold text-center">Excluir</button>
                </div>
            </div>`;
    });
}

async function criarUsuario() {
    const email = document.getElementById('novo-user-email').value;
    const password = document.getElementById('novo-user-senha').value;
    const role = document.getElementById('novo-user-role').value;

    if(password.length < 6) return alert("Senha mínima de 6 caracteres.");

    // Cria o usuário na Auth via Admin (sem deslogar quem está usando o sistema)
    const { data, error } = await _adminAuth.auth.admin.createUser({ email, password, email_confirm: true });
    
    if (error) alert("Erro: " + error.message);
    else {
        // Atualiza a role na tabela perfis (o trigger já criou com 'normal', a gente sobrescreve se precisar)
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
