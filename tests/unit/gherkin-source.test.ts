import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GherkinSource } from "@/components/feature-editor";

test("realça apenas palavras-chave, preservando texto, tags e comentários", () => {
  const html = renderToStaticMarkup(createElement(GherkinSource, { source: "# language: pt\n@smoke\nFuncionalidade: Login\n  Cenário: Acessar\n    Dado que existe uma conta\n    Então vejo o painel" }));
  expect([...html.matchAll(/class="gherkin-keyword">([^<]+)<\/span>/g)].map(match => match[1])).toEqual(["Funcionalidade", "Cenário", "Dado", "Então"]);
  expect(html).toContain("</span> que existe uma conta");
  expect(html).toContain("@smoke");
});

test("realça palavras compostas e não confunde prefixos com palavras-chave", () => {
  const html = renderToStaticMarkup(createElement(GherkinSource, { source: "Scenario Outline: checkout\nEsquema do Cenário: pagamento\nDados cadastrais\nDadoque não é palavra-chave\n* uma ação" }));
  expect([...html.matchAll(/class="gherkin-keyword">([^<]+)<\/span>/g)].map(match => match[1])).toEqual(["Scenario Outline", "Esquema do Cenário", "Dados", "*"]);
});
