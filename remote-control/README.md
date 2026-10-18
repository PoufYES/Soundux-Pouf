# Soundux Pouf - controle web

Abra `soundux.exe` na raiz do projeto ou o atalho Soundux na Area de Trabalho. Esta versao e compilada do codigo-fonte, sem modificar o executavel depois da compilacao.

- **CONECTAR CELULAR** inicia o controle e mostra o painel de pareamento dentro do Soundux, sem abrir navegador ou reiniciar o aplicativo. Escaneie o QR Code com a camera do celular. Ele expira em dois minutos e pode ser usado uma vez. Nao e preciso copiar IP nem chave.
- O QR seleciona primeiro o IP da rede fisica ativa (Ethernet ou Wi-Fi), priorizando o adaptador com rota para o roteador. Redes virtuais ficam fora das opcoes. O nome `soundux-<identificador do PC>.local:3210` fica como opcao para celulares que resolvem nomes locais; ele permanece igual quando o IP muda. Um atalho por IP precisa ser refeito quando o IP mudar.
- No celular, salve nos favoritos ou adicione a tela inicial pelo menu do navegador. A autorizacao permanece por ate 180 dias no mesmo navegador; limpar cookies ou trocar de navegador exige novo pareamento. A tela no PC lista os dispositivos e permite desconecta-los.
- PC e celular devem estar na mesma rede. O Soundux precisa permanecer aberto. Na primeira conexao, o Windows pode solicitar autorizacao para criar as regras de firewall TCP 3210 e UDP 5353, limitadas a rede local. Nao instala servicos nem altera o roteador.
- Sair do Soundux encerra o servidor e o motor de audio em cerca de 1 segundo. Minimizar para a bandeja mantem o controle ativo. Abas e saidas sao publicadas automaticamente enquanto o aplicativo esta aberto.

`dist/` contem a interface desktop; `tools/` contem FFmpeg e youtube-dl, usados pelo Downloader. Mantenha essas pastas e `remote-control/` junto do executavel. O controle requer Node.js e Python com miniaudio (`python -m pip install miniaudio`).

O controle toca os arquivos no PC, pelas saidas configuradas, sem simular teclado ou mouse. Cada clique substitui o som anterior; Parar todos interrompe a reproducao remota. A barra de reproducao desktop e independente.

Configuracoes permanecem em `%APPDATA%\Soundux\config.json`. Sons e autorizacoes dos dispositivos ficam em `%LOCALAPPDATA%\Soundux-Pouf`. As credenciais sao armazenadas como hashes em `remote-devices.json`. O estado atual das abas e saidas e publicado atomicamente em `remote-state.json` quando muda, sem modificar a configuracao principal. A chave compartilhada e o arquivo de enderecos antigos sao removidos ao iniciar; links antigos deixam de autorizar o controle. Sincronizar no celular apenas atualiza as abas; nao fecha o aplicativo nem altera os atalhos. Escaneie o QR apenas nos seus dispositivos.

O controle usa Node.js com `qrcode` e `multicast-dns`, fixados no `package-lock.json`. O iniciador instala as dependencias de producao com `npm ci --omit=dev` se estiverem ausentes. Para desenvolvimento: `cd remote-control`, `npm ci` e `npm test`. Os testes cobrem expiracao, uso unico, persistencia, revogacao e o fluxo HTTP com leitura do QR Code gerado. A interface pode ser salva como atalho; nao depende de service worker ou instalacao de PWA por HTTPS.

Para recompilar: `powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1`. Requer Visual Studio Build Tools 2022 com C++, CMake e SDK do Windows. A compilacao usa uma pasta temporaria e copia somente o executavel final para a raiz. A verificacao de atualizacoes usa HTTPS pelo WinHTTP do Windows.

O motor remoto prepara as sa?das ao conectar e as mant?m abertas com buffer solicitado de 10 ms (o Windows e o dispositivo podem ajustar o valor real). Os sons s?o pr?-decodificados em segundo plano em um cache de at? 128 MiB; arquivos alterados s?o recarregados. Sons fora do cache precisam ser decodificados no primeiro toque. Parar silencia as sa?das sem fech?-las. Para aplicar uma atualiza??o do motor, feche e abra o Soundux e conecte o celular novamente.

Valida??o do motor: `python -m unittest discover -s remote-control -p test_audio_engine.py`.

Em Configurações > Idioma, selecione **Português (Brasil)**. A seleção traduz a interface, mensagens, controles e menu da bandeja imediatamente e fica salva para as próximas aberturas. O identificador antigo `pt_BR` continua compatível. Os textos ficam em `i18n/pt-BR.json` e `i18n/vuetify-pt-BR.json`, aplicados por `remote-control/prepare-ui.py` a cada compilação.

Teste de regressão das configurações no Windows: após compilar e fechar outras instâncias do Soundux, execute `cd remote-control` e `npm run test:native-settings`. O teste usa o executável real e o WebView2 com dados temporários isolados; verifica saídas de áudio, salvamentos repetidos, idioma e recuperação de campos inválidos. Não requer instalar um navegador adicional.

Com **Minimizar para a bandeja do sistema** ativado, o botão X apenas oculta a janela e mantém o controle remoto funcionando. Clique no ícone da bandeja para restaurar a janela, ou use o botão direito e **Mostrar janela**. **Sair** no menu da bandeja encerra o Soundux, o servidor e o motor de áudio. Com a opção desativada, o X encerra normalmente. O teste nativo cobre os dois modos de fechamento, a restauração e a finalização do controle remoto.
