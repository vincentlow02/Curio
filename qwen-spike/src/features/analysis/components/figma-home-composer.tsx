"use client";

const categories = [
  {
    id: "toys",
    label: <>Toys &amp; Character<br />Collectibles</>,
    image: "/figma/category-toys.png",
  },
  {
    id: "games",
    label: <>Cards &amp; Game<br />Collectibles</>,
    image: "/figma/category-games.png",
  },
  {
    id: "music",
    label: <>Records &amp; Music<br />Collectibles</>,
    image: "/figma/category-music.png",
  },
] as const;

export function FigmaHomeComposer(): React.ReactElement {
  return (
    <section className="figma-home-composer" data-node-id="10:20" aria-labelledby="collectible-heading">
      <div className="figma-home-discovery" data-node-id="9:135">
        <header className="figma-home-heading" data-node-id="9:136">
          <h1 id="collectible-heading">What are you looking for ?</h1>
          <p>Discover where to look in Tokyo and what price to expect.</p>
        </header>

        <div className="figma-category-grid" data-node-id="9:139">
          {categories.map((category) => (
            <button className={`figma-category-card figma-category-card--${category.id}`} type="button" key={category.id}>
              <span className="figma-category-visual">
                <span className="figma-category-image"><img src={category.image} alt="" /></span>
                <span className="figma-category-label">{category.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <form className="figma-composer-box" data-node-id="2:162" onSubmit={(event) => event.preventDefault()}>
        <label className="sr-only" htmlFor="collectible-query">Describe what you are looking for</label>
        <textarea id="collectible-query" rows={1} placeholder="Upload a photo or describe what you’re looking for" />
        <div className="figma-composer-actions" data-node-id="2:164">
          <button className="figma-composer-round-button" type="button" aria-label="Upload a photo">
            <img src="/figma/composer-add.svg" alt="" />
          </button>
          <div className="figma-composer-actions-right" data-node-id="2:166">
            <button className="figma-composer-microphone" type="button" aria-label="Use microphone">
              <img src="/figma/composer-microphone.svg" alt="" />
            </button>
            <button className="figma-composer-round-button" type="submit" aria-label="Submit">
              <img src="/figma/composer-submit.svg" alt="" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
