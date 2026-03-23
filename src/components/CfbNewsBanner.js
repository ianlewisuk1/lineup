import React, { useEffect, useState } from "react";

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/news";
const CACHE_KEY = "cfb_news_cache";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Fetches CFB headlines from ESPN's free public endpoint.
// Caches the result in sessionStorage so subsequent visits within 30 minutes cost nothing.
// Renders nothing on error or while loading — purely additive UI.
function CfbNewsBanner() {
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        // Check cache first — validate shape to avoid stale data after code changes
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          const isValid = Date.now() - timestamp < CACHE_TTL
            && Array.isArray(data)
            && data.length > 0
            && data[0].image !== undefined; // ensure cache has current shape
          if (isValid) {
            setArticles(data);
            return;
          }
        }

        // Fetch fresh data — request more than we need so we have enough with images
        const res = await fetch(`${ESPN_URL}?limit=15`);
        if (!res.ok) return;
        const json = await res.json();

        const items = (json.articles || [])
          .map(a => ({
            headline: a.headline,
            href: a.links?.web?.href || null,
            image: a.images?.[0]?.url || null,
          }))
          .filter(a => a.headline && a.image) // only articles with an image
          .slice(0, 3);                        // most recent 3

        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: items }));
        setArticles(items);
      } catch {
        // Silent fail — news is additive, never block the page
      }
    };

    load();
  }, []);

  if (articles.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        CFB News
      </div>

      {/* Horizontally scrollable row of headline cards */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`
          .cfb-scroll::-webkit-scrollbar { display: none; }
          .cfb-card:hover { border-color: #D1D5DB !important; }
        `}</style>
        {articles.map((article, i) => {
          const inner = (
            <>
              {/* Thumbnail — fixed 60×60, object-fit cover keeps it tidy regardless of aspect ratio */}
              {article.image && (
                <div style={{ width: '100%', height: 120, borderRadius: '10px 10px 0 0', overflow: 'hidden', flexShrink: 0 }}>
                  <img
                    src={article.image}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {article.headline}
                </div>
                {article.href && (
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, fontWeight: 500 }}>ESPN →</div>
                )}
              </div>
            </>
          );

          const cardStyle = {
            flexShrink: 0,
            width: 200,
            backgroundColor: '#ffffff',
            border: '1.5px solid #F3F4F6',
            borderRadius: 12,
            overflow: 'hidden',
            textDecoration: 'none',
            display: 'block',
            transition: 'border-color 0.15s',
          };

          return article.href ? (
            <a key={i} href={article.href} target="_blank" rel="noopener noreferrer" className="cfb-card" style={cardStyle}>
              {inner}
            </a>
          ) : (
            <div key={i} style={cardStyle}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CfbNewsBanner;
