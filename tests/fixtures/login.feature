# language: pt
@smoke
Funcionalidade: Autenticação do produto
  Contexto:
    Dado que o ambiente de QA está disponível

  @id:login-principal @requirement:REQ-LOGIN @automation:login-principal
  Cenário: Entrar com credenciais válidas
    Dado que estou na página de login
    Quando informo credenciais válidas
    E seleciono entrar
    Então vejo o painel do produto
