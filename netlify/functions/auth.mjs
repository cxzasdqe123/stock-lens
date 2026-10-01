const CLIENT_ID = "848367507389-ohu8r1uc525oq6l3b58ta5e5i2geboie.apps.googleusercontent.com";

export default async (request) => {
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

  if (request.method !== "POST") return json({error:"method_not_allowed"},405);

  try {
    const body = await request.json();
    const credential = body?.credential;
    if (!credential) return json({error:"missing_credential"},400);

    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), {
      headers: {"user-agent":"Stock-Lens/1.0"}
    });
    if (!res.ok) return json({error:"invalid_google_token"},401);

    const info = await res.json();
    if (info.aud !== CLIENT_ID) return json({error:"invalid_audience"},401);
    if (String(info.email_verified) !== "true") return json({error:"email_not_verified"},401);

    const user = {
      user_id:info.sub,
      email:info.email,
      display_name:info.name || "",
      photo_url:info.picture || ""
    };

    let db_sync = "not_configured";
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const internalSecret = process.env.APP_INTERNAL_SECRET;

    if (scriptUrl && internalSecret) {
      try {
        const dbRes = await fetch(scriptUrl, {
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({
            secret:internalSecret,
            action:"upsertUser",
            user
          })
        });
        const dbJson = await dbRes.json().catch(()=>({}));
        db_sync = dbRes.ok && dbJson.ok ? "ok" : "failed";
      } catch (e) {
        db_sync = "failed";
      }
    }

    return json({ ok:true, user, db_sync });
  } catch (err) {
    return json({error:String(err?.message || err)},500);
  }
};