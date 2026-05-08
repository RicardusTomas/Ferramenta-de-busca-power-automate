const express = require('express');
const axios = require('axios');
const { PublicClientApplication } = require('@azure/msal-node');

const app = express();
const fs = require('fs');
const path = require('path');
const PORT = 3000;
const FLOW_SCOPE = 'https://service.flow.microsoft.com/user_impersonation';
const BAP_SCOPE = 'https://api.bap.microsoft.com/.default';

app.use(express.static(__dirname));
app.use(express.json());

// MSAL config usando Azure CLI client ID
const msalConfig = {
  auth: {
    clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46',
    authority: 'https://login.microsoftonline.com/organizations'
  }
};
const pca = new PublicClientApplication(msalConfig);
const deviceCodeSessions = new Map();

async function acquireBapToken(account) {
  if (!account) return null;

  try {
    const tokenResponse = await pca.acquireTokenSilent({
      account,
      scopes: [BAP_SCOPE]
    });
    return tokenResponse?.accessToken || null;
  } catch (error) {
    console.warn('Nao foi possivel obter token para BAP:', error.message || error);
    return null;
  }
}

// Endpoint para listar ambientes disponíveis
app.get('/api/environments', async (req, res) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header ausente' });
  }

  try {
    const response = await axios.get('https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2016-11-01', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    const envs = (response.data?.value || []).map(e => ({
      id: e.name,
      displayName: e.properties?.displayName || e.name,
      type: e.properties?.environmentSku
    }));
    
    res.json({ environments: envs });
  } catch (error) {
    console.error('Erro ao listar ambientes:', error);
    res.status(500).json({ error: 'Erro ao listar ambientes: ' + (error.message || error) });
  }
});

// NOTE: suporte a amostras locais removido — a aplicação opera agora apenas com fluxos reais do ambiente.

// Endpoint para descobrir ambiente a partir de URL do CRM
app.post('/api/discover-env', async (req, res) => {
  const { crmUrl } = req.body;
  const authHeader = req.headers['authorization'];
  
  if (!crmUrl || !authHeader) {
    return res.status(400).json({ error: 'crmUrl e Authorization header sao obrigatorios' });
  }

  try {
    const crmMatch = crmUrl.match(/https:\/\/([a-zA-Z0-9_-]+)\.crm[0-9]*\.dynamics\.com/);
    if (!crmMatch) {
      return res.status(400).json({ error: 'URL do CRM invalida' });
    }
    const orgName = crmMatch[1];

    const response = await axios.get('https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2016-11-01', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    const envs = response.data.value || [];
    const matchedEnv = envs.find(e => e.properties?.displayName?.toLowerCase().includes(orgName.toLowerCase()) || e.name?.toLowerCase().includes(orgName.toLowerCase()));
    
    if (matchedEnv) {
      res.json({ environmentId: matchedEnv.name });
    } else {
      res.status(404).json({ error: 'Ambiente para organizacao "' + orgName + '" nao encontrado' });
    }
  } catch (error) {
    console.error('Erro ao descobrir ambiente:', error);
    res.status(500).json({ error: 'Erro ao descobrir ambiente: ' + (error.message || error) });
  }
});

// Endpoint para iniciar Device Code Flow (suporta MFA)
app.post('/api/device-code', async (req, res) => {
  let resSent = false;
  try {
    let session = {
      status: 'pending',
      deviceCode: null,
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      interval: 5,
      tokens: null,
      error: null
    };

    const deviceCodeRequest = {
      scopes: [FLOW_SCOPE],
      deviceCodeCallback: (response) => {
        session.deviceCode = response.deviceCode;
        session.userCode = response.userCode;
        session.verificationUri = response.verificationUri;
        session.expiresAt = Date.now() + response.expiresIn * 1000;
        session.interval = response.interval || 5;
        deviceCodeSessions.set(session.deviceCode, session);

        if (!resSent) {
          resSent = true;
          res.json({
            deviceCode: session.deviceCode,
            userCode: session.userCode,
            verificationUri: session.verificationUri,
            message: response.message,
            expiresIn: response.expiresIn,
            interval: session.interval
          });
        }
      }
    };

    pca.acquireTokenByDeviceCode(deviceCodeRequest).then((tokenResponse) => {
      if (session && session.deviceCode) {
        session.status = 'complete';
        acquireBapToken(tokenResponse.account).then((bapAccessToken) => {
          session.tokens = {
            flowAccessToken: tokenResponse.accessToken,
            bapAccessToken
          };
        });
      }
    }).catch((error) => {
      if (session && session.deviceCode) {
        session.status = 'error';
        session.error = error.message || String(error);
      }
      console.error('Erro no device code flow (background):', error);
      
      if (!resSent) {
        resSent = true;
        res.status(500).json({ error: 'Erro na autenticação: ' + (error.message || error) });
      }
    });

    // Timeout de segurança se o callback não for chamado
    setTimeout(() => {
      if (!resSent) {
        resSent = true;
        res.status(504).json({ error: 'Timeout ao iniciar autenticação com a Microsoft' });
      }
    }, 15000);

  } catch (error) {
    console.error('Erro ao configurar device code flow:', error);
    if (!resSent) {
      resSent = true;
      res.status(500).json({ error: 'Erro ao iniciar autenticação: ' + (error.message || error) });
    }
  }
});

// Endpoint para polling do device code (verifica se usuário autenticou)
app.post('/api/device-code-poll', async (req, res) => {
  const { deviceCode } = req.body;
  
  if (!deviceCode) {
    return res.status(400).json({ error: 'Device code is required' });
  }

  const session = deviceCodeSessions.get(deviceCode);
  if (!session) {
    return res.status(404).json({ error: 'Sessao de device code nao encontrada' });
  }

  if (session.status === 'complete') {
    if (!session.tokens?.flowAccessToken) {
      return res.status(202).json({ status: 'pending' });
    }
    return res.json(session.tokens);
  }
  if (session.status === 'error') {
    const err = session.error || 'Autenticacao falhou';
    deviceCodeSessions.delete(deviceCode);
    return res.status(401).json({ error: err });
  }
  if (Date.now() > session.expiresAt) {
    deviceCodeSessions.delete(deviceCode);
    return res.status(408).json({ error: 'Device code expirou' });
  }

  return res.status(202).json({ status: 'pending' });
});

// Endpoint para login com username/password
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password são obrigatórios' });
  }

  try {
    const tokenResponse = await pca.acquireTokenByUsernamePassword({
      scopes: [FLOW_SCOPE],
      username,
      password
    });
    const bapAccessToken = await acquireBapToken(tokenResponse.account);
    res.json({
      flowAccessToken: tokenResponse.accessToken,
      bapAccessToken
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(401).json({ error: 'Falha na autenticação: ' + (error.message || error) });
  }
});

// Proxy genérico para APIs do Power Platform (resolve problema de CORS)
// O token de autenticação vem do browser (MSAL.js) via header Authorization
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    const authHeader = req.headers['authorization'];

    if (!url) {
        return res.status(400).json({ error: 'Parâmetro "url" é obrigatório' });
    }
    if (!authHeader) {
        return res.status(401).json({ error: 'Header Authorization ausente' });
    }

    try {
        const parsedUrl = new URL(url);
        for (const key of [...parsedUrl.searchParams.keys()]) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'continuationtoken' || normalizedKey === '$skiptoken') {
                parsedUrl.searchParams.set(key, parsedUrl.searchParams.get(key).replace(/ /g, '+'));
            }
        }
        const targetUrl = parsedUrl.toString();

        const response = await axios.get(targetUrl, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        res.json(response.data || {});
    } catch (error) {
        if (error.code === 'ETIMEDOUT') {
            return res.status(504).json({ error: 'Timeout ao conectar com a API' });
        }
        const status = error.response?.status || 500;
        const message = error.response?.data?.error?.message
            || error.response?.data?.message
            || error.message;
        res.status(status).json({ error: message, details: error.response?.data });
    }
});

app.listen(PORT, () => {
    console.log(`\n✅ Ferramenta de Busca de Fluxos Power Platform`);
    console.log(`   Acesse: http://localhost:${PORT}\n`);
});
