CREATE UNIQUE INDEX "account_providerId_accountId_uidx"
  ON auth."account" ("providerId", "accountId");
