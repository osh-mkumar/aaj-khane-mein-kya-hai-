"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search } from "lucide-react";
import type { Recipe } from "@/types";
import { api } from "../ui/shared";

// Module-level cache to avoid redundant API requests across components
let cachedRecipes: Recipe[] | null = null;
let fetchPromise: Promise<Recipe[]> | null = null;

async function fetchRecipeCatalog(): Promise<Recipe[]> {
  if (cachedRecipes && cachedRecipes.length > 0) {
    return cachedRecipes;
  }
  if (!fetchPromise) {
    fetchPromise = api<Recipe[]>("recipes")
      .then((data) => {
        cachedRecipes = data || [];
        return cachedRecipes;
      })
      .catch((err) => {
        fetchPromise = null;
        console.error("Failed to load recipes for autocomplete:", err);
        return [];
      });
  }
  return fetchPromise;
}

export interface RecipeSearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (recipe: Recipe) => void;
  recipes?: Recipe[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  maxSuggestions?: number;
  autoFocus?: boolean;
}

export function RecipeSearchAutocomplete({
  value,
  onChange,
  onSelect,
  recipes,
  placeholder = "Find a favourite…",
  ariaLabel = "Search recipes",
  className = "",
  maxSuggestions = 8,
  autoFocus = false,
}: RecipeSearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [internalRecipes, setInternalRecipes] = useState<Recipe[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recipes from API if not provided via props
  useEffect(() => {
    if (!recipes || recipes.length === 0) {
      fetchRecipeCatalog().then((data) => {
        setInternalRecipes(data);
      });
    }
  }, [recipes]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Compute filtered suggestions in real time, case-insensitively with partial matching
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];

    const source = (recipes && recipes.length > 0) ? recipes : internalRecipes;
    return source
      .filter((r) => {
        const nameMatch = r.name.toLowerCase().includes(q);
        const categoryMatch = r.mealCategory?.toLowerCase().includes(q);
        return nameMatch || categoryMatch;
      })
      .slice(0, maxSuggestions);
  }, [value, recipes, internalRecipes, maxSuggestions]);

  const handleSelect = (recipe: Recipe) => {
    onChange(recipe.name);
    onSelect(recipe);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (value.trim().length > 0) {
          setIsOpen(true);
        }
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightedIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1
      );
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`recipe-autocomplete-wrapper ${className}`}
    >
      <div className="search">
        <Search size={18} />
        <input
          ref={inputRef}
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (value.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {isOpen && value.trim().length > 0 && (
        <div
          className="recipe-autocomplete-dropdown"
          role="listbox"
          id="recipe-autocomplete-list"
        >
          {suggestions.length > 0 ? (
            suggestions.map((recipe, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={recipe.id}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  className={`recipe-autocomplete-item ${
                    isHighlighted ? "active" : ""
                  }`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelect(recipe)}
                >
                  <div className="recipe-autocomplete-info">
                    <span className="recipe-autocomplete-name">
                      {recipe.name}
                    </span>
                    {recipe.mealCategory && (
                      <span className="recipe-autocomplete-category">
                        {recipe.mealCategory}
                      </span>
                    )}
                  </div>
                  <div className="recipe-autocomplete-badges">
                    {recipe.source === "HOUSEHOLD_CUSTOM" && (
                      <span className="recipe-badge-mini custom">Our Way</span>
                    )}
                    {recipe.source === "MENDELEY" && (
                      <span className="recipe-badge-mini mendeley">Mendeley</span>
                    )}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="recipe-autocomplete-empty">No recipes found</div>
          )}
        </div>
      )}
    </div>
  );
}
