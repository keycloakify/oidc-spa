# `oidc-spa` + `react-router-dom` example

Run this setup:

```bash
git clone https://github.com/garronej/oidc-spa
cd oidc-spa
yarn

cat << EOF > ./examples/react-router/.env.local
VITE_OIDC_ISSUER=<REPLACE HERE>
VITE_OIDC_CLIENT_ID=<REPLACE HERE>
EOF

yarn start-react-router-example
```
