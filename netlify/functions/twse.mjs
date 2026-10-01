export default async (request, context) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "quote";
  const symbol = url.searchParams.get("symbol") || "2383";

  const json = (data, status=200) => new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

  try {
    if (type === "quote") {
      const exCh = "tse_" + symbol + ".tw";
      const target = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=" + encodeURIComponent(exCh) + "&_=" + Date.now();
      const res = await fetch(target, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "referer": "https://mis.twse.com.tw/stock/fibest.jsp?stock=" + symbol
        }
      });
      if (!res.ok) throw new Error("TWSE MIS " + res.status);
      const data = await res.json();
      return json(data);
    }

    if (type === "index") {
      const target = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&_=" + Date.now();
      const res = await fetch(target, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "referer": "https://mis.twse.com.tw/"
        }
      });
      if (!res.ok) throw new Error("TWSE MIS " + res.status);
      return json(await res.json());
    }

    if (type === "history") {
      const months = Number(url.searchParams.get("months") || "3");
      const d = new Date();
      const out = [];
      for (let i=0;i<months;i++) {
        const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()-i, 1));
        const key = "" + x.getUTCFullYear() + String(x.getUTCMonth()+1).padStart(2,"0") + "01";
        const target = "https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=" + key + "&stockNo=" + encodeURIComponent(symbol);
        const res = await fetch(target, {headers: {"user-agent":"Mozilla/5.0"}});
        if (!res.ok) continue;
        const data = await res.json();
        if (data.stat === "OK" && Array.isArray(data.data)) out.push(...data.data);
      }
      return json({stat:"OK", data: out});
    }

    if (type === "daily") {
      const res = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {headers: {"user-agent":"Mozilla/5.0"}});
      if (!res.ok) throw new Error("TWSE OpenAPI " + res.status);
      const rows = await res.json();
      return json(rows);
    }

    if (type === "market") {
      const res = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX", {headers: {"user-agent":"Mozilla/5.0"}});
      if (!res.ok) throw new Error("TWSE OpenAPI " + res.status);
      return json(await res.json());
    }

    return json({error:"unsupported type"},400);
  } catch (err) {
    return json({error:String(err?.message || err)},502);
  }
};