// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://tvjadtkhjbbttszairxe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI3MDMsImV4cCI6MjEwMjY2ODcwM30.-5QfzCMPIzO7rV8CqTlnNkyWkoVGFnMwMYqDKDBzJXQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let usuarioAtual = null;
let html5QrcodeScanner = null;

// --- 1. AUTENTICAÇÃO ---
async function cadastrar() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { data, error } = await _supabase.auth.signUp({ email, password });
    
    if (error) document.getElementById('auth-msg').innerText = error.message;
    else alert("Conta criada! Se necessário, faça login.");
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        document.getElementById('auth-msg').innerText = "Erro ao entrar. Verifique os dados.";
    } else {
        usuarioAtual = data.user;
        mudarTela('app-screen');
        carregarVendasHoje();
        carregarLivros();
    }
}

async function logout() {
    await _supabase.auth.signOut();
    mudarTela('login-screen');
}

function mudarTela(telaId) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById(telaId).classList.remove('hidden');
}

// Verifica se já está logado ao abrir a página
_supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        usuarioAtual = session.user;
        mudarTela('app-screen');
        carregarVendasHoje();
        carregarLivros();
    }
});

// --- 2. CÂMERA E ISBN ---
function iniciarCamera() {
    if(html5QrcodeScanner) return;
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
    html5QrcodeScanner.render(aoLerCodigo, erroNaLeitura);
}

async function aoLerCodigo(textoLido) {
    html5QrcodeScanner.clear();
    html5QrcodeScanner = null;
    
    document.getElementById('isbn').value = textoLido;
    buscarDadosLivro(textoLido);
}

function erroNaLeitura(erro) { /* Ignorar erros frame a frame */ }

async function buscarDadosLivro(isbn) {
    try {
        const resposta = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const dados = await resposta.json();
        if (dados.items && dados.items.length > 0) {
            document.getElementById('titulo').value = dados.items[0].volumeInfo.title;
        } else {
            alert("Título não encontrado. Digite manualmente.");
        }
    } catch (e) {
        console.log("Erro ao buscar livro na API", e);
    }
}

// --- 3. BANCO DE DADOS (CADASTRAR LIVRO) ---
async function salvarLivro() {
    const isbn = document.getElementById('isbn').value;
    const titulo = document.getElementById('titulo').value;
    const preco = parseFloat(document.getElementById('preco').value);
    const qtd = parseInt(document.getElementById('qtd').value);

    if(!isbn || !titulo || !preco) return alert("Preencha ISBN, Título e Preço!");

    const { data, error } = await _supabase
        .from('livros')
        .insert([{ 
            isbn: isbn, 
            titulo: titulo, 
            preco: preco, 
            quantidade: isNaN(qtd) ? 0 : qtd, 
            user_id: usuarioAtual.id 
        }]);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        alert("Livro cadastrado com sucesso!");
        document.getElementById('isbn').value = '';
        document.getElementById('titulo').value = '';
        document.getElementById('preco').value = '';
        document.getElementById('qtd').value = '';
        
        carregarLivros();
    }
}

// --- 4. LISTAR E GERENCIAR ESTOQUE ---
async function carregarLivros() {
    const { data, error } = await _supabase
        .from('livros')
        .select('*')
        .order('titulo', { ascending: true });

    const listaDiv = document.getElementById('lista-livros');
    if (!listaDiv) return;
    
    listaDiv.innerHTML = '';

    if (data && data.length > 0) {
        data.forEach(livro => {
            listaDiv.innerHTML += `
                <div class="p-3 border rounded-lg flex justify-between items-center bg-white shadow-sm">
                    <div>
                        <p class="font-bold text-gray-800">${livro.titulo}</p>
                        <p class="text-xs text-gray-500">ISBN: ${livro.isbn || 'N/A'}</p>
                        <p class="text-sm text-blue-600 font-semibold mt-1">Qtd: ${livro.quantidade} | R$ ${Number(livro.preco).toFixed(2)}</p>
                    </div>
                    <button onclick="venderLivro('${livro.id}', ${livro.preco})" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-bold shadow">Vender</button>
                </div>
            `;
        });
    } else {
        listaDiv.innerHTML = '<p class="text-gray-500 text-sm text-center py-2">Nenhum livro cadastrado ainda.</p>';
    }
}

// --- 5. VENDER LIVRO (DEBITAR ESTOQUE) ---
async function venderLivro(id, preco) {
    const { data: livro } = await _supabase.from('livros').select('quantidade').eq('id', id).single();
    
    if (livro && livro.quantidade > 0) {
        await _supabase.from('livros').update({ quantidade: livro.quantidade - 1 }).eq('id', id);
        
        await _supabase.from('movimentacoes').insert([{
            livro_id: id,
            tipo: 'venda',
            quantidade: 1,
            valor_total: preco,
            user_id: usuarioAtual.id
        }]);
        
        carregarLivros();
        carregarVendasHoje();
    } else {
        alert("Estoque esgotado para este livro!");
    }
}

// --- 6. RELATÓRIO DE VENDAS DIÁRIO ---
async function carregarVendasHoje() {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    const { data, error } = await _supabase
        .from('movimentacoes')
        .select('valor_total')
        .eq('tipo', 'venda')
        .gte('data_hora', hoje.toISOString());

    if (data) {
        const total = data.reduce((soma, mov) => soma + Number(mov.valor_total), 0);
        const elementoVendas = document.getElementById('vendas-hoje');
        if (elementoVendas) {
            elementoVendas.innerText = `R$ ${total.toFixed(2)}`;
        }
    }
}
