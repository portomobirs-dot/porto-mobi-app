# Porto Mobi Executivo — aplicativo móvel

Aplicativo React Native / Expo com áreas de Cliente, Motorista e Administrador.

O app carrega as interfaces do Firebase Hosting em WebView. Para operar, o Firebase Hosting, Authentication e Firestore precisam estar publicados e configurados.

## Desenvolvimento

```bash
npm install
npx expo start
```

## Gerar APK Android

É necessário configurar uma conta Expo/EAS e credenciais de assinatura Android:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

O perfil `preview` de `eas.json` produz APK para instalação interna; `production` produz Android App Bundle para publicação na Play Store.

**Estado:** código-fonte criado; build, assinatura, publicação nas lojas e teste ponta a ponta ainda não comprovados.
