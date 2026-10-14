// Mi cuenta: cambio de contraseña propio (requiere la contraseña actual).
import { auth, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "../firebase.js";
import { modal, toast, busy, formData } from "../core/ui.js";
import { authError } from "../core/auth.js";

export function changePasswordDialog() {
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<label class="field"><span>Contraseña actual</span><input class="input" type="password" name="cur" autocomplete="current-password" required></label>
    <label class="field"><span>Nueva contraseña (mín. 8)</span><input class="input" type="password" name="n1" autocomplete="new-password" minlength="8" required></label>
    <label class="field"><span>Repite la nueva contraseña</span><input class="input" type="password" name="n2" autocomplete="new-password" required></label>`;
  const m = modal({ title: "Cambiar mi contraseña", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>Actualizar</button>` });
  const go = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (f.n1.length < 8) return toast("La nueva contraseña debe tener al menos 8 caracteres.", "warn");
    if (f.n1 !== f.n2) return toast("Las contraseñas no coinciden.", "warn");
    try {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, f.cur));
      await updatePassword(u, f.n1);
      toast("Contraseña actualizada.", "ok"); m.close();
    } catch (e) { toast(authError(e), "bad"); }
  });
  m.$("[data-save]").onclick = go;
  body.addEventListener("submit", (e) => { e.preventDefault(); go(); });
}
