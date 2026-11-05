# 💰 Minhas Finanças

Aplicativo de **controle financeiro pessoal** para Android (e qualquer celular), feito como **PWA**: instala na tela inicial, funciona **100% offline** e **não custa nada** para rodar.

🔒 **Privacidade:** os dados ficam **somente no seu celular**. Nada é enviado para servidores — o site serve apenas o código do app.

## O que o app faz

| Tela | Para que serve |
|---|---|
| **Início** | Mostra quanto você tem **livre para gastar** no mês (e quanto dá **por dia**), com a conta explicada: receitas − contas fixas − gastos variáveis − meta de economia. Também mostra contas pendentes/atrasadas e para onde foi o dinheiro. |
| **Lançamentos** | Todas as receitas e despesas do mês, agrupadas por dia, com busca e filtros. |
| **Contas fixas** | Aluguel, internet, plano de saúde, parcelas (ex.: 4/10), salário… Marque como pago com um toque, ajuste o valor real (contas de luz/água variam), veja o que está atrasado. |
| **Gráficos** | Receitas × despesas, gastos por categoria, fixas × variáveis, evolução do saldo e resumo mês a mês (3, 6, 12 meses ou ano). |
| **Mais** | Meta de economia, saldo inicial, categorias personalizadas, **exportar para Excel**, backup/restauração, tema claro/escuro. |

### Exportação para Excel
Gera um arquivo `.xlsx` com 5 abas: **Resumo mensal**, **Lançamentos**, **Por categoria**, **Contas fixas** (situação de cada mês) e **Cadastro fixas**. Valores já formatados em R$ e datas em dd/mm/aaaa. Também exporta `.csv` no padrão brasileiro. Abre no Excel, Google Planilhas e LibreOffice.

### Investimentos (futuro)
A estrutura de dados já reserva espaço para o módulo de investimentos (aportes, resgates, patrimônio, distribuição da carteira).

---

## Como colocar no seu celular (grátis)

O app precisa estar num endereço `https://` uma única vez para o Android instalar. Depois disso ele roda sozinho, offline.

### Opção A — GitHub Pages (recomendado)
> O GitHub Pages é gratuito para **repositórios públicos**. Tornar o repositório público expõe só o **código** — seus dados financeiros nunca saem do celular.

1. Faça o merge deste código na branch `main`.
2. No GitHub: **Settings → General → Danger Zone → Change visibility → Public**.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Vá em **Actions → "Publicar app (GitHub Pages)" → Run workflow** (ou faça qualquer push na `main`).
5. O endereço será: `https://<seu-usuario>.github.io/Aplicativo-Teste/`

### Opção B — manter o repositório privado
Use **Netlify** ou **Cloudflare Pages** (planos gratuitos aceitam repositórios privados): conecte o repositório, sem comando de build, pasta de publicação = raiz (`/`).

### Instalando no Android
1. Abra o endereço no **Chrome** do celular.
2. Toque em **Instalar** (aparece um aviso no app) ou no menu **⋮ → Instalar app / Adicionar à tela inicial**.
3. Pronto! O ícone “Finanças” aparece na tela inicial e o app abre em tela cheia, mesmo sem internet.

### Atualizações
Quando uma nova versão for publicada, o app avisa “Nova versão disponível — Atualizar”. Seus dados são mantidos.

---

## ⚠️ Faça backup
Como os dados ficam só no aparelho, **limpar os dados do Chrome, desinstalar o app ou trocar de celular apaga tudo**. Use **Mais → Fazer backup** de vez em quando e mande o arquivo para o Google Drive/e-mail. Para recuperar: **Mais → Restaurar backup**.

## Para quem quiser mexer no código
- HTML/CSS/JavaScript puro (módulos ES), sem etapa de build.
- Bibliotecas embutidas em `vendor/` (funcionam offline): [Chart.js 4.4.4](https://www.chartjs.org/) e [SheetJS 0.18.5](https://sheetjs.com/) (Apache-2.0), carregada só na hora de exportar.
- Rodar localmente: `python3 -m http.server 8000` e abrir `http://localhost:8000`.

```
index.html            estrutura e navegação
css/styles.css        visual (tema claro/escuro automático)
js/app.js             telas, formulários e ações
js/store.js           dados (localStorage), categorias, backup
js/calc.js            cálculos: livre para gastar, contas do mês, séries
js/charts.js          gráficos
js/export.js          Excel (.xlsx), CSV e backup (.json)
js/ui.js              painel inferior, confirmação, avisos
sw.js                 modo offline (service worker)
manifest.webmanifest  instalação como app
```

Ao alterar arquivos, aumente `VERSION` em `sw.js` para os celulares baixarem a nova versão.
