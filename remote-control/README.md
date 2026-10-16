# Soundux Remote

Controle local para Windows, sem banco de dados. Execute o atalho **Controle Soundux** na raiz do projeto. Ele prepara atalhos, inicia o Soundux e abre o controle no PC. Abra no celular o endereço informado em `%LOCALAPPDATA%\Soundux-Pouf\remote-address.txt`, incluindo `?key=...`. PC e celular precisam estar na mesma rede, sem isolamento de clientes. Não exponha a porta 3210 na internet.

O servidor usa Node.js 24 e a biblioteca padrão. As teclas são enviadas pelo Windows; o próprio Soundux reproduz os áudios nas saídas configuradas. Atalhos existentes são preservados. Sons sem atalho recebem combinações de Ctrl esquerdo + Alt esquerdo + Shift esquerdo, com até 60 combinações automáticas. Não mantenha outras teclas pressionadas enquanto envia comandos. O controle não altera a saída de áudio.

Após adicionar ou baixar novos sons no Soundux, clique em **Sincronizar**. Isso salva a configuração pelo encerramento normal, prepara atalhos e reabre o aplicativo. Há backups da configuração ao lado de `%APPDATA%\Soundux\config.json`. O controle mostra a última configuração salva, e não o estado de reprodução em tempo real. O Soundux deve rodar no mesmo usuário e nível de permissão do controle.

Wi-Fi: use o IP Wi-Fi do PC. USB no Android: ative compartilhamento de rede USB e use o IP desse adaptador no PC, porta 3210, com a mesma chave. USB depende do suporte de compartilhamento de rede do aparelho. O arquivo de endereços é gerado ao iniciar o servidor.

Se o Windows bloquear o acesso, permita Node.js apenas na rede privada pelo Firewall. A chave do link dá acesso ao controle; compartilhe somente com seus dispositivos. Para encerrar o servidor, finalize o processo Node correspondente a `server.mjs`.
