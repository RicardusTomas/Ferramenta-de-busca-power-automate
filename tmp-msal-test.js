const { PublicClientApplication } = require('@azure/msal-node');
const pca = new PublicClientApplication({
  auth: {
    clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46',
    authority: 'https://login.microsoftonline.com/organizations'
  }
});
console.log('method', typeof pca.acquireTokenByDeviceCode);
const req = {
  scopes: ['https://service.flow.microsoft.com/.default'],
  deviceCodeCallback: (response) => {
    console.log('cb called', response ? response.message : response);
    process.exit(0);
  }
};
pca.acquireTokenByDeviceCode(req).then(() => {
  console.log('resolved');
  process.exit(0);
}).catch((e) => {
  console.error('error', e.message);
  process.exit(1);
});
setTimeout(() => {
  console.log('timeout');
  process.exit(0);
}, 5000);
