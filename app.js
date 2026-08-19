// --- CONFIGURAÇÃO DO SUPABASE ---
// COLE AQUI SUA URL E SUA CHAVE ANON DO SUPABASE
const SUPABASE_URL = 'https://tvjadtkhjbbttszairxe.supabase.co/rest/v1/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amFkdGtoamJidHRzemFpcnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTI3MDMsImV4cCI6MjEwMjY2ODcwM30.-5QfzCMPIzO7rV8CqTlnNkyWkoVGFnMwMYqDKDBzJXQ';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let usuarioAtual = null;
let html5QrcodeScanner = null;

// --- 1. AUTENTICAÇÃO ---
async function cadastrar() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) document.getElementById('auth-msg').innerText = error.message;
    else alert("Conta criada! Confirme seu e-mail (se necessário) ou faça login.");
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('senha').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
        document.getElementById('auth-msg').innerText = "Erro ao entrar. Verifique os dados.";
    } else {
        usuarioAtual = data.user;
        mudarTela('app-screen');
        carregarVendasHoje();
    }
}

async function logout() {
    await supabase.auth.signOut();
    mudarTela('login-screen');
}

function mudarTela(telaId) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById(telaId).classList.remove('hidden');
}

// Verifica se já está logado ao abrir a página
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        usuarioAtual = session.user;
        mudarTela('app-screen');
        carregarVendasHoje();
    }
});

// --- 2. CÂMERA E ISBN ---
function iniciarCamera() {
    if(html5QrcodeScanner) return; // já está aberta
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
    html5QrcodeScanner.render(aoLerCodigo, erroNaLeitura);
}

async function aoLerCodigo(textoLido) {
    // Parar a câmera assim que ler
    html5QrcodeScanner.clear();
    html5QrcodeScanner = null;
    
    document.getElementById('isbn').value = textoLido;
    buscarDadosLivro(textoLido);
}

function erroNaLeitura(erro) { /* Ignorar erros frame a frame da câmera */ }

// Busca título na API gratuita do Google Books
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

    // Insere na tabela 'livros'
    const { data, error } = await supabase
        .from('livros')
        .insert([{ 
            isbn: isbn, 
            titulo: titulo, 
            preco: preco, 
            quantidade: qtd, 
            user_id: usuarioAtual.id 
        }]);

    if (error) {
        alert("Erro ao salvar: " + error.message);
    } else {
        alert("Livro cadastrado com sucesso!");
        // Limpar campos
        document.getElementById('isbn').value = '';
        document.getElementById('titulo').value = '';
        document.getElementById('preco').value = '';
        document.getElementById('qtd').value = '';
    }
}

// --- 4. RELATÓRIO DE VENDAS DIÁRIO ---
async function carregarVendasHoje() {
    // Pega a data de hoje à meia noite para filtrar
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    const { data, error } = await supabase
        .from('movimentacoes')
        .select('valor_total')
        .eq('tipo', 'venda')
        .gte('data_hora', hoje.toISOString());

    if (data) {
        const total = data.reduce((soma, mov) => soma + Number(mov.valor_total), 0);
        document.getElementById('vendas-hoje').innerText = `R$ ${total.toFixed(2)}`;
    }
}
