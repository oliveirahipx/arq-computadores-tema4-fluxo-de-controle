# Abre o .docx bruto no Word, atualiza Sumário e listas (figuras, quadros, tabelas),
# salva a versão final e exporta o PDF.
# Uso: powershell -ExecutionPolicy Bypass -File finalizar_no_word.ps1
$dir = Split-Path -Parent $PSScriptRoot
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open("$dir\_bruto.docx")
  # Listas de legendas usam \t "Estilo,nível"; no Word em pt-BR o separador é ";".
  $sep = $word.International(17)  # wdListSeparator
  foreach ($f in $doc.Fields) {
    $c = $f.Code.Text
    if ($c -match '\\t "Legenda') { $f.Code.Text = $c -replace ',1"', ($sep + '1"') }
  }
  $doc.Fields.Update() | Out-Null
  foreach ($t in $doc.TablesOfContents) { $t.Update() | Out-Null }
  $doc.Repaginate()
  foreach ($t in $doc.TablesOfContents) { $t.UpdatePageNumbers() | Out-Null }
  $doc.SaveAs2("$dir\Relatorio_Tema4_Fluxo_de_Controle.docx", 16)
  $doc.ExportAsFixedFormat("$dir\Relatorio_Tema4_Fluxo_de_Controle.pdf", 17)
  "paginas: " + $doc.ComputeStatistics(2)
  $doc.Close(0)
} finally { $word.Quit() }
Remove-Item "$dir\_bruto.docx"
