# 📊 Fator R — Gerenciador

Aplicação web (PWA) para acompanhar **faturamento, pró-labore e despesas** da
empresa e ficar de olho no **Fator R**, para saber sempre quanto retirar de
pró-labore e continuar no **Anexo III** do Simples Nacional em vez de cair no
**Anexo V**.

Feita para uso pessoal/empresa específica — todos os dados ficam **só no seu
navegador** (localStorage). Nada é enviado para nenhum servidor.

## 📱 Funcionalidades

- **Painel com alerta de Fator R**: mostra o Anexo vigente neste mês (o que
  define o seu DAS) e a **projeção para o mês que vem**, com o valor mínimo de
  pró-labore que falta retirar para não cair no Anexo V — e, quando há sobra,
  mostra quanto disso poderia ir como lucro distribuído em vez de pró-labore
  para pagar menos INSS.
- **Botão + flutuante**: lança uma despesa ou cria o próximo mês sem precisar
  navegar até uma aba específica.
- **Lançamento mensal** de faturamento, pró-labore, regime (MEI/ME), DAS pago
  e despesas do mês (com categorias e quebra visual), tudo na aba Lançar.
- **Histórico** de todos os meses lançados, com o Anexo de cada um.
- **Empréstimos**: parcelas, saldo devedor, mês de início.
- **Fechamento anual em CSV**: exporta uma planilha com todos os meses de um
  ano (faturamento, pró-labore, DAS, INSS, despesas, lucro, Fator R) — ótimo
  para guardar no fim do ano ou mandar para o contador.
- **Backup manual completo**: exporte/importe um arquivo `.json` com todos os
  seus dados (em Ajustes), já que tudo fica salvo localmente no navegador.
- **Campos em decimal "à brasileira"**: aceitam vírgula ou ponto (`1500,50`
  ou `1500.50`), sem precisar digitar zeros extras.
- **Gráficos** de faturamento × lucro disponível (Chart.js).
- **Instalável (PWA)**: pode ser adicionada à tela inicial do iOS/Android.
- **Modo claro/escuro automático**: segue a aparência do sistema (iOS/Android) — não tem botão de alternância, é automático via `prefers-color-scheme`.

> Honorários contábeis não são mais um parâmetro fixo — lance-os como despesa
> (categoria "Contabilidade") sempre que pagar. Assim o valor acompanha
> automaticamente quando você troca de contador ou o preço muda.

> O app começa com um único mês em branco (o mês atual) — sem dados de
> exemplo. Lance só o que for de verdade da sua empresa.

## ⚙️ Como funciona o cálculo

O motor de cálculo (`js/calc.js`) segue a metodologia oficial do PGDAS-D:

- O **Anexo e o DAS de um mês** usam o RBT12/folha de pagamento dos **12 meses
  anteriores** a ele (sem contar o próprio mês) — é assim que a Receita
  calcula de fato.
- Por isso, o que você lança **hoje** só vai pesar no enquadramento do
  **mês que vem**. O painel mostra essa projeção para você decidir o
  pró-labore deste mês com antecedência, em vez de descobrir o problema só
  quando o contador fechar a guia.
- Tabelas do Anexo III e Anexo V e valores de referência (salário mínimo,
  teto do INSS, DAS-MEI) estão atualizados para 2026 e podem ser ajustados em
  **Ajustes**, caso a Receita Federal reajuste os valores no futuro.

Sempre confirme os valores de imposto com seu contador — este app é uma
ferramenta de planejamento, não substitui a apuração oficial.

## 🗂️ Estrutura do projeto

```
index.html          shell da aplicação (liga CSS/JS)
css/styles.css       tema roxo, todos os estilos
js/calc.js           motor de cálculo puro (sem DOM) — Fator R, Anexo III/V
js/storage.js        persistência em localStorage + exportar/importar backup
js/app.js            interface, abas e eventos
manifest.json        manifest da PWA
icons/               ícones do app (192/512/apple-touch-icon)
tests/calc.test.js   testes de fumaça do motor de cálculo (`node tests/calc.test.js`)
```

## 🧪 Rodando os testes

```bash
node tests/calc.test.js
```

Não precisa instalar nada — usa só o `node` e o módulo `assert` nativo.
Útil para conferir a lógica depois de qualquer ajuste nas tabelas de imposto.

## 📲 Como instalar no iOS / Android

1. Abra o link do projeto (publicado via GitHub Pages) no navegador.
2. **iOS (Safari)**: toque em Compartilhar → "Adicionar à Tela de Início".
3. **Android (Chrome)**: toque no menu → "Adicionar à tela inicial" / "Instalar app".

## 🚀 Publicando no GitHub Pages

1. Suba esta pasta para um repositório no GitHub.
2. Em **Settings → Pages**, selecione a branch principal e a pasta raiz (`/`).
3. O GitHub vai te dar uma URL pública (`https://seu-usuario.github.io/seu-repo/`).

## 🚀 Rodando localmente

Basta abrir o `index.html` direto no navegador — não precisa de servidor nem
build. Se preferir servir localmente (recomendado para testar a instalação
como PWA): `npx serve .` ou `python3 -m http.server`.

---
*Os dados ficam salvos apenas no navegador onde você usa o app (localStorage).
Exporte um backup em Ajustes de vez em quando para não perder nada se limpar
o cache do navegador ou trocar de aparelho.*
