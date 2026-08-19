// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://tvjadtkhjbbttszairxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI3MDMsImV4cCI6MjEwMjY2ODcwM30.-5QfzCMPIzO7rV8CqTlnNkyWkoVGFnMwMYqDKDBzJXQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let usuarioAtual = null;
let html5QrcodeScanner = null;
let listaCacheLivros = [];
let carrinhoAtual = []; // Guarda os itens da venda atual

// --- 1. AUTENTICAÇÃO ---
async function cadastrar() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) document.getElementById('auth-msg').innerText = error.message;
    else alert("Conta criada! Faça login.");
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        document.getElementById('auth-msg').innerText = "Erro ao entrar. Verifique os dados.";
    } else {
        usuarioAtual = data.user;
        mudarTelaApp();
    }
}

async function logout() {
    await _supabase.auth.signOut();
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

function mudarTelaApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    carregarDadosGlobais();
}

_supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        usuarioAtual = session.user;
        mudarTelaApp();
    }
});

// --- CONTROLE DE ABAS ---
function mudarAba(abaId, titulo) {
    document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${abaId}`).classList.remove('hidden');
    document.getElementById('titulo-aba').innerText = titulo;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-blue-600');
        btn.classList.add('text-gray-400');
    });
    document.getElementById(`btn-${abaId}`).classList.remove('text-gray-400');
    document.getElementById(`btn-${abaId}`).classList.add('text-blue-600');

    if (abaId === 'estoque' || abaId === 'edicao') carregarLivrosGeral();
    if (abaId === 'vendas') carregarVendasHoje();
}

// --- CARREGAR DADOS GLOBAIS ---
async function carregarDadosGlobais() {
    const { data } = await _supabase.from('livros').select('*').order('titulo', { ascending: true });
    if (data) listaCacheLivros = data;
    carregarVendasHoje();
}

// --- CÂMERA DINÂMICA ---
function iniciarCamera(modo) {
    const elementoId = modo === 'cadastro' ? 'reader-cadastro' : 'reader-venda';
    if(html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
    }
    
    html5QrcodeScanner = new Html5QrcodeScanner(elementoId, { fps: 10, qrbox: {width: 250, height: 150} }, false);
    
    if (modo === 'cadastro') {
        html5QrcodeScanner.render(async (texto) => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
            document.getElementById('cad-isbn').value = texto;
            buscarDadosGoogle(texto);
        }, () => {});
    } else {
        html5QrcodeScanner.render(async (texto) => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
            document.getElementById('venda-isbn').value = texto;
            adicionarAoCarrinhoPorIsbn();
        }, () => {});
    }
}

async function buscarDadosGoogle(isbn) {
    try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const dados = await res.json();
        if (dados.items && dados.items.length > 0) {
            document.getElementById('cad-titulo').value = dados.items[0].volumeInfo.title;
        }
    } catch (e) { console.log(e); }
}

// --- ABA 1: CADASTRAR ---
async function salvarLivro() {
    const isbn = document.getElementById('cad-isbn').value;
    const titulo = document.getElementById('cad-titulo').value;
    const preco = parseFloat(document.getElementById('cad-preco').value);
    const qtd = parseInt(document.getElementById('cad-qtd').value);

    if(!isbn || !titulo || !preco) return alert("Preencha ISBN, Título e Preço!");

    const { error } = await _supabase.from('livros').insert([{ 
        isbn, titulo, preco, quantidade: isNaN(qtd) ? 0 : qtd, user_id: usuarioAtual.id 
    }]);

    if (error) alert("Erro: " + error.message);
    else {
        alert("Livro cadastrado!");
        document.getElementById('cad-isbn').value = '';
        document.getElementById('cad-titulo').value = '';
        document.getElementById('cad-preco').value = '';
        document.getElementById('cad-qtd').value = '';
        carregarDadosGlobais();
    }
}

// --- ABA 2 E 3: ESTOQUE E EDIÇÃO/EXCLUSÃO ---
async function carregarLivrosGeral() {
    await carregarDadosGlobais();
    
    const divEstoque = document.getElementById('lista-estoque-geral');
    divEstoque.innerHTML = listaCacheLivros.length ? '' : '<p class="text-gray-500 text-center">Nenhum livro.</p>';
    listaCacheLivros.forEach(l => {
        divEstoque.innerHTML += `
            <div class="p-3 border rounded-lg bg-white shadow-sm">
                <p class="font-bold text-gray-800">${l.titulo}</p>
                <p class="text-xs text-gray-500">ISBN: ${l.isbn || '-'}</p>
                <p class="text-sm text-blue-600 font-semibold mt-1">Estoque: ${l.quantidade} | R$ ${Number(l.preco).toFixed(2)}</p>
            </div>`;
    });

    const divEdicao = document.getElementById('lista-edicao');
    divEdicao.innerHTML = listaCacheLivros.length ? '' : '<p class="text-gray-500 text-center">Nenhum livro.</p>';
    listaCacheLivros.forEach(l => {
        divEdicao.innerHTML += `
            <div class="p-3 border rounded-lg flex justify-between items-center bg-white shadow-sm">
                <div>
                    <p class="font-bold text-gray-800 text-sm">${l.titulo}</p>
                    <p class="text-xs text-gray-500">Qtd: ${l.quantidade} | R$ ${Number(l.preco).toFixed(2)}</p>
                </div>
                <div class="flex gap-1">
                    <button onclick="abrirModal(${l.id}, '${l.titulo.replace(/'/g, "")}', ${l.preco}, ${l.quantidade})" class="bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold">Editar</button>
                    <button onclick="excluirLivro(${l.id})" class="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">Excluir</button>
                </div>
            </div>`;
    });
}

function filtrarEstoque() {
    const termo = document.getElementById('filtro-estoque').value.toLowerCase();
    const divEstoque = document.getElementById('lista-estoque-geral');
    divEstoque.innerHTML = '';
    const filtrados = listaCacheLivros.filter(l => l.titulo.toLowerCase().includes(termo) || (l.isbn && l.isbn.includes(termo)));
    
    filtrados.forEach(l => {
        divEstoque.innerHTML += `
            <div class="p-3 border rounded-lg bg-white shadow-sm">
                <p class="font-bold text-gray-800">${l.titulo}</p>
                <p class="text-xs text-gray-500">ISBN: ${l.isbn || '-'}</p>
                <p class="text-sm text-blue-600 font-semibold mt-1">Estoque: ${l.quantidade} | R$ ${Number(l.preco).toFixed(2)}</p>
            </div>`;
    });
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

    const { error } = await _supabase.from('livros').update({ titulo, preco, quantidade }).eq('id', id);
    if (error) alert("Erro ao atualizar");
    else {
        fecharModal();
        carregarLivrosGeral();
        alert("Atualizado com sucesso!");
    }
}

async function excluirLivro(id) {
    if (confirm("Tem certeza que deseja excluir este livro?")) {
        await _supabase.from('livros').delete().eq('id', id);
        carregarLivrosGeral();
    }
}

// --- ABA 4: CARRINHO E VENDAS ---
function adicionarAoCarrinhoPorIsbn() {
    const isbn = document.getElementById('venda-isbn').value.trim();
    if (!isbn) return alert("Insira ou escaneie um ISBN!");

    const livro = listaCacheLivros.find(l => l.isbn === isbn);
    if (!livro) return alert("Livro não encontrado com este ISBN!");

    if (livro.quantidade <= 0) return alert("Este livro está esgotado no estoque!");

    // Verificar se já está no carrinho
    const itemExistente = carrinhoAtual.find(i => i.id === livro.id);
    if (itemExistente) {
        if (itemExistente.qtd < livro.quantidade) {
            itemExistente.qtd++;
        } else {
            alert("Quantidade máxima disponível em estoque atingida!");
        }
    } else {
        carrinhoAtual.push({
            id: livro.id,
            titulo: livro.titulo,
            preco: livro.preco,
            qtd: 1,
            estoqueMax: livro.quantidade
        });
    }

    document.getElementById('venda-isbn').value = '';
    renderizarCarrinho();
}

function alterarQtdCarrinho(id, delta) {
    const item = carrinhoAtual.find(i => i.id === id);
    if (item) {
        item.qtd += delta;
        if (item.qtd <= 0) {
            carrinhoAtual = carrinhoAtual.filter(i => i.id !== id);
        } else if (item.qtd > item.estoqueMax) {
            item.qtd = item.estoqueMax;
            alert("Estoque máximo atingido.");
        }
        renderizarCarrinho();
    }
}

function renderizarCarrinho() {
    const div = document.getElementById('lista-carrinho');
    div.innerHTML = '';

    if (carrinhoAtual.length === 0) {
        div.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Nenhum item adicionado ainda.</p>';
        document.getElementById('carrinho-total').innerText = 'R$ 0,00';
        return;
    }

    let totalGeral = 0;
    carrinhoAtual.forEach(item => {
        const subtotal = item.preco * item.qtd;
        totalGeral += subtotal;
        div.innerHTML += `
            <div class="flex justify-between items-center bg-white p-2 rounded border text-xs">
                <div>
                    <p class="font-bold text-gray-800">${item.titulo}</p>
                    <p class="text-gray-500">R$ ${Number(item.preco).toFixed(2)} un</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="alterarQtdCarrinho('${item.id}', -1)" class="bg-gray-200 px-2 py-0.5 rounded font-bold">-</button>
                    <span class="font-bold">${item.qtd}</span>
                    <button onclick="alterarQtdCarrinho('${item.id}', 1)" class="bg-gray-200 px-2 py-0.5 rounded font-bold">+</button>
                    <span class="font-semibold text-blue-600">R$ ${subtotal.toFixed(2)}</span>
                </div>
            </div>
        `;
    });

    document.getElementById('carrinho-total').innerText = `R$ ${totalGeral.toFixed(2)}`;
}

async function finalizarVenda() {
    if (carrinhoAtual.length === 0) return alert("A cesta está vazia!");

    const nomeCliente = document.getElementById('cli-nome').value.trim() || null;
    const emailCliente = document.getElementById('cli-email').value.trim() || null;

    // Gerar número sequencial único baseado no timestamp atual (Ex: 2603181245)
    const codigoVendaSeq = Math.floor(Date.now() / 1000); 

    let totalVenda = 0;

    // Processar cada item da cesta
    for (const item of carrinhoAtual) {
        const subtotal = item.preco * item.qtd;
        totalVenda += subtotal;

        // Atualizar estoque no Supabase
        const novoEstoque = item.estoqueMax - item.qtd;
        await _supabase.from('livros').update({ quantidade: novoEstoque }).eq('id', item.id);

        // Inserir registro na tabela movimentacoes
        await _supabase.from('movimentacoes').insert([{
            livro_id: item.id,
            tipo: 'venda',
            quantidade: item.qtd,
            valor_total: subtotal,
            codigo_venda: codigoVendaSeq,
            cliente_nome: nomeCliente,
            cliente_email: emailCliente,
            user_id: usuarioAtual.id
        }]);
    }

    alert(`Venda #${codigoVendaSeq} finalizada!\nTotal a passar na maquininha: R$ ${totalVenda.toFixed(2)}`);

    // Limpar carrinho e inputs
    carrinhoAtual = [];
    document.getElementById('cli-nome').value = '';
    document.getElementById('cli-email').value = '';
    renderizarCarrinho();
    carregarDadosGlobais();
}

async function carregarVendasHoje() {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    const { data } = await _supabase.from('movimentacoes').select('valor_total').eq('tipo', 'venda').gte('data_hora', hoje.toISOString());
    if (data) {
        const total = data.reduce((soma, m) => soma + Number(m.valor_total), 0);
        document.getElementById('vendas-hoje').innerText = `R$ ${total.toFixed(2)}`;
    }
}

// EXPORTAR EXCEL (DIÁRIO, SEMANAL, MENSAL)
async function exportarExcel(periodo) {
    const agora = new Date();
    let dataLimite = new Date();

    if (periodo === 'diario') {
        dataLimite.setHours(0,0,0,0);
    } else if (periodo === 'semanal') {
        dataLimite.setDate(agora.getDate() - 7);
    } else if (periodo === 'mensal') {
        dataLimite.setMonth(agora.getMonth() - 1);
    }

    const { data, error } = await _supabase
        .from('movimentacoes')
        .select(`
            codigo_venda,
            quantidade,
            valor_total,
            data_hora,
            cliente_nome,
            cliente_email,
            livros (titulo, isbn, preco)
        `)
        .eq('tipo', 'venda')
        .gte('data_hora', dataLimite.toISOString())
        .order('data_hora', { ascending: false });

    if (error || !data || data.length === 0) {
        return alert("Nenhuma venda encontrada para o período selecionado.");
    }

    const formatado = data.map(m => ({
        'Nº Venda': m.codigo_venda || '-',
        'Data / Hora': new Date(m.data_hora).toLocaleString('pt-BR'),
        'Título do Livro': m.livros ? m.livros.titulo : 'Removido',
        'ISBN': m.livros ? m.livros.isbn : '-',
        'Quantidade': m.quantidade,
        'Valor Total (R$)': Number(m.valor_total),
        'Nome Cliente': m.cliente_nome || 'Não informado',
        'E-mail Cliente': m.cliente_email || 'Não informado'
    }));

    const worksheet = XLSX.utils.json_to_sheet(formatado);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendas");

    XLSX.writeFile(workbook, `relatorio_vendas_${periodo}.xlsx`);
}
