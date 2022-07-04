# 使用方法

## ビルド

-  ./credential.template.jsを元に、Secretを記載した./credential.jsを作成してください。
- ./src/credential.template.tsを元に、Client ID を記載した./src/credential.tsを作成してください。

```sh
$ npm i
$ npm run build
```

ビルドは初回のみ必要です。

## ローカルサーバー起動

```sh
$ npm run open
```

## アプリ仕様

### start画面
最初の画面で接続方法を設定してstartを押すと接続画面に移行します。  
特に設定変更の必要のない場合はそのままstartできます。

### connect画面
次の画面でconnectを押すと接続できます。ブラウザで複数タブを開いて相互接続できます。  
接続開始時は音声映像ともにsoftmuteになっています。

-> ボタン押下でmute変更等が行えます。またこの処理はconnect前にも行うことができます。

disconnectボタン押下で終了します。

## ローカルサーバー終了

Ctrl+Cで終了してください