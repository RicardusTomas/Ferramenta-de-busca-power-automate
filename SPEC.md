# Ferramenta de Busca de Fluxos Power Platform

## Visão Geral

- **Nome do Projeto**: Ferramenta de Busca de Fluxos Power Platform
- **Tipo**: Solução low-code para gestão de fluxos Power Automate
- **Funcionalidade Principal**: Centralizar metadados de fluxos Power Automate para busca e gestão via portal
- **Usuários Alvo**: Desenvolvedores citizen, administradores, e gestores de TI

## Arquitetura

### Componentes

1. **Dataverse Tables**
   - `msfer_fluxo` - Metadados dos fluxos (nome, descrição, tipo, conexões, proprietário)
   - `msfer_ambiente` - Ambientes do Power Platform
   - `msfer_conector` - Conectores utilizados nos fluxos
   - `msfer_solucao` - Soluções que contêm os fluxos

2. **Power Automate Flows**
   - Sincronização de fluxos via Management API
   - Sincronização de conexões
   - Sincronização de ambientes
   - Sincronização de soluções

3. **Power Pages Portal**
   - Página de busca de fluxos
   - Página de detalhes do fluxo
   - Página de visualização de conexões

### Fluxo de Dados

```
Management API →Power Automate → Dataverse → Power Pages Portal
                         ↓
              Tabelas de metadados
```

## Especificação de Tabelas

### msfer_fluxo

| Campo | Tipo | Descrição |
|-------|------|-----------|
| msfer_name | String | Nome do fluxo |
| msfer_flowid | GUID | ID do fluxo no Power Automate |
| msfer_displayname | String | Nome de exibição |
| msfer_description | String | Descrição |
| msfer_state | OptionSet | Status (Ativado/Desativado/Rascunho) |
| msfer_type | OptionSet | Tipo (Fluxo de nuvem/Automático/Instantâneo) |
| msfer_createdby | String | Criado por |
| msfer_modifiedby | String | Modificado por |
| msfer_createdon | DateTime | Data de criação |
| msfer_modifiedon | DateTime | Data de modificação |
| msfer_ambiente | Lookup | Ambiente |
| msfer_solucao | Lookup | Solução |
| msfer_conectores | MultiLookup | Conectores |

### msfer_ambiente

| Campo | Tipo | Descrição |
|-------|------|-----------|
| msfer_name | String | Nome do ambiente |
| msfer_environmentid | GUID | ID do ambiente |
| msfer_displayname | String | Nome de exibição |
| msfer_type | OptionSet | Tipo (Produção/Teste/Desenvolvimento) |
| msfer_region | String | Região |
| msfer_isdefault | Boolean | É padrão |

### msfer_conector

| Campo | Tipo | Descrição |
|-------|------|-----------|
| msfer_name | String | Nome do conector |
| msfer_connectorid | GUID | ID do conector |
| msfer_displayname | String | Nome de exibição |
| msfer_api | String | API do conector |
| msfer_tier | OptionSet | Tier (Standard/Premium) |

### msfer_solucao

| Campo | Tipo | Descrição |
|-------|------|-----------|
| msfer_name | String | Nome da solução |
| msfer_solutionid | GUID | ID da solução |
| msfer_displayname | String | Nome de exibição |
| msfer_publisher | String | Publicador |
| msfer_version | String | Versão |

## Especificação de Flows

### Sincronização de Fluxos

1. Listar fluxos via Management API
2. Para cada fluxo, verificar se existe no Dataverse
3. Se não existir, criar registro
4. Se existir, atualizar metadados

### Sincronização de Ambientes

1. Listar ambientes via Management API
2. Sincronizar com tabela msfer_ambiente

### Sincronização de Conectores

1. Listar conectores de cada ambiente
2. Sincronizar com tabela msfer_conector

### Sincronização de Soluções

1. Listar soluções via Management API
2. Sincronizar com tabela msfer_solucao

## Especificação do Portal

### Busca de Fluxos

- Campo de busca text
- Filtros por: ambiente, tipo, status, conector
- Ordenação por: nome, data de modificação
- Paginação

### Detalhes do Fluxo

- Exibir todos os metadados
- Link para abreviação no Power Automate
- Histórico de modificações

## Requisitos Não Funcionais

- Sincronização agendada (diária)
- Notificação de erros por email
- Logs de sincronização
- Limite de 5000 fluxos por ambiente

## Integrações

- Microsoft Power Automate Management API
- Microsoft Dataverse
- Microsoft Power Pages