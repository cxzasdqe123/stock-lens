const CLIENT_ID = "848367507389-ohu8r1uc525oq6l3b58ta5e5i2geboie.apps.googleusercontent.com";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

async function verifyGoogle(credential) {
  if (!credential) throw new Error("missing_credential");
  const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), {
    headers: {"user-agent":"Stock-Lens/1.0"}
  });
  if (!res.ok) throw new Error("invalid_google_token");

  const info = await res.json();
  if (info.aud !== CLIENT_ID) throw new Error("invalid_audience");
  if (String(info.email_verified) !== "true") throw new Error("email_not_verified");

  return {
    user_id: info.sub,
    email: info.email,
    display_name: info.name || "",
    photo_url: info.picture || ""
  };
}

async function callDb(action, user, extra = {}) {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  const internalSecret = process.env.APP_INTERNAL_SECRET;
  if (!scriptUrl || !internalSecret) return {ok:false, error:"not_configured"};

  const res = await fetch(scriptUrl, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      secret:internalSecret,
      action,
      user,
      ...extra
    })
  });
  const body = await res.json().catch(()=>({ok:false,error:"invalid_db_response"}));
  if (!res.ok) return {ok:false,error:"db_http_"+res.status};
  return body;
}

export default async (request) => {
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);

  try {
    const body = await request.json();
    const credential = body?.credential;
    const action = body?.action || "login";
    const user = await verifyGoogle(credential);

    if (action === "login") {
      const db = await callDb("upsertUser", user);
      return json({ok:true, user, db_sync:db.ok ? "ok" : (db.error || "failed")});
    }

    if (action === "getWatchlist") {
      const db = await callDb("getWatchlist", user);
      return json(db.ok ? {ok:true, groups:db.groups || []} : {ok:false,error:db.error || "db_failed"}, db.ok ? 200 : 502);
    }

    if (action === "saveWatchlist") {
      const groups = Array.isArray(body?.groups) ? body.groups : [];
      const db = await callDb("saveWatchlist", user, {groups});
      return json(db.ok ? {ok:true, group_count:db.group_count, stock_count:db.stock_count} : {ok:false,error:db.error || "db_failed"}, db.ok ? 200 : 502);
    }

    return json({ok:false,error:"invalid_action"},400);
  } catch (err) {
    const msg = String(err?.message || err);
    const status = /missing_credential|invalid_google_token|invalid_audience|email_not_verified/.test(msg) ? 401 : 500;
    return json({error:msg},status);
  }
};
