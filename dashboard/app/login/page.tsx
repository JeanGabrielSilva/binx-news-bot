export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  return (
    <main className="login">
      <form method="POST" action="/api/login" className="card">
        <h1>CX Cryptos — Painel</h1>
        {searchParams.erro && <p className="error">Senha incorreta.</p>}
        <input type="password" name="password" placeholder="Senha" autoFocus required />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
