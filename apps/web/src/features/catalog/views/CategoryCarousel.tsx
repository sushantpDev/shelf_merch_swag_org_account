import { type ReactNode, useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";

export type CategoryTile = {
  label: string;
  image: string;
  imageAlt?: string;
  category?: string;
};

type CategoryCarouselProps = {
  title: ReactNode;
  titleId?: string;
  viewAllLabel: string;
  items: readonly CategoryTile[];
  onViewAll: () => void;
  onSelect: (item: CategoryTile) => void;
};

export function CategoryCarousel({
  title,
  titleId,
  viewAllLabel,
  items,
  onViewAll,
  onSelect,
}: CategoryCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    slidesToScroll: "auto",
    dragFree: false,
  });
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);

  const onReInit = useCallback(() => {
    if (!emblaApi) return;
    setSnaps(emblaApi.scrollSnapList());
    setSelected(emblaApi.selectedScrollSnap());
    setCanScrollNext(emblaApi.canScrollNext());
    setCanScrollPrev(emblaApi.canScrollPrev());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onReInit();
    emblaApi.on("reInit", onReInit);
    emblaApi.on("select", onReInit);
    return () => {
      emblaApi.off("reInit", onReInit);
      emblaApi.off("select", onReInit);
    };
  }, [emblaApi, onReInit]);

  return (
    <div className="sm-cat-container">
      <div className="sm-cat-head">
        <h2 className="sm-cat-title" id={titleId}>
          {title}
        </h2>
        <button type="button" className="sm-cat-viewall" onClick={onViewAll}>
          {viewAllLabel}
          <ArrowUpRight aria-hidden="true" />
        </button>
      </div>

      <div className="sm-cat-carousel">
        <div className="sm-cat-viewport" ref={emblaRef}>
          <div className="sm-cat-track">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="sm-cat-tile"
                onClick={() => onSelect(item)}
              >
                <div className="sm-cat-tile-img">
                  <img src={item.image} alt={item.imageAlt ?? item.label} />
                </div>
                <span className="sm-cat-tile-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="sm-cat-next sm-cat-next--previous"
          aria-label="Previous categories"
          disabled={!canScrollPrev}
          onClick={() => emblaApi?.scrollPrev()}
        >
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sm-cat-next"
          aria-label="Next categories"
          disabled={!canScrollNext}
          onClick={() => emblaApi?.scrollNext()}
        >
          <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {snaps.length > 1 ? (
        <div className="sm-cat-dots" role="tablist" aria-label="Category pages">
          {snaps.map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-label={`Show page ${index + 1}`}
              aria-selected={index === selected}
              className={index === selected ? "sm-cat-dot sm-cat-dot--on" : "sm-cat-dot"}
              onClick={() => emblaApi?.scrollTo(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
