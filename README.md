# Public Engineering Notebook

Um site pessoal minimalista para documentar:

- projetos
- atualizações de projetos
- Today I Learned
- artigos
- decisões e aprendizados

## Rodando localmente

```bash
npm install
npm run dev
```

Depois abra o endereço mostrado pelo Astro.

## Build

```bash
npm run build
```

Os arquivos finais ficam em `dist/`.

## Como publicar conteúdo

### Novo artigo

Crie um arquivo em:

`src/content/writing/meu-artigo.md`

### Novo TIL

Crie um arquivo em:

`src/content/til/meu-til.md`

### Nova atualização de projeto

Crie um arquivo em:

`src/content/updates/minha-atualizacao.md`

Use o campo `project` para relacionar a atualização a um projeto.

### Novo projeto

Crie um arquivo em:

`src/content/projects/meu-projeto.md`

## Manutenção

O site foi propositalmente construído com:

- Astro
- CSS puro
- Markdown
- sem banco de dados
- sem CMS obrigatório
- sem framework client-side

A maior parte das alterações editoriais exige apenas criar ou editar Markdown.
