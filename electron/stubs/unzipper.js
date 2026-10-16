// O leitor em "streaming" do ExcelJS (que usa unzipper) não é usado pelo Excel Fácil:
// os arquivos são lidos com xlsx.load(). Este substituto evita distribuir o unzipper.
module.exports = new Proxy({}, {
  get() {
    throw new Error('Leitura em streaming não suportada.');
  },
});
