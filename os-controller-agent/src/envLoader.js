/**
 * Nạp cấu hình động từ file opc_vault.json hoặc Config Vault vào process.env runtime
 */
export async function syncFromVault() {
  try {
    const { getVaultConfig } = await import('./configVault.js');
    const cfg = await getVaultConfig();
    for (const [key, val] of Object.entries(cfg)) {
      if (val !== undefined && val !== null && val !== '') {
        process.env[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
      }
    }
    console.log(`[EnvLoader] Đã nạp cấu hình đã giải mã từ Vault cho os-controller-agent.`);
    return true;
  } catch (err) {
    console.warn(`[EnvLoader] Lỗi đọc vault cho OS Controller: ${err.message}`);
  }
  return false;
}
