# language: pt
@demo @smoke
Funcionalidade: Checkout fictício Aurora Commerce
  Cenário: Confirmar pedido com dados de demonstração
    Dado que um cliente fictício possui um carrinho válido
    Quando confirma a compra no ambiente QA
    Então o pedido fictício é confirmado sem duplicação
