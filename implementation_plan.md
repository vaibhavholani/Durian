# AI-Driven Content Generation System for Durian Furniture

This plan outlines the technical implementation of the AI-driven content generation system as described in the PRD. The system will automate the creation of SEO-optimized product descriptions, titles, and marketing content using LLMs.

## User Review Required

> [!IMPORTANT]
> - **LLM Selection:** Use **Gemini API** for initial implementation. The system will feature a provider-agnostic wrapper to easily switch to Claude (or others) in the future.
> - **Technology Stack:** FastAPI (Python) backend + React (Vite) frontend.
> - **Feedback Mechanism:** A "Like/Dislike" and "Style Memory" system. "Liked" generations will be stored as "Gold Examples" and used in few-shot prompting to align with the user's taste.

## Proposed Changes

We will initialize a new project structure with `frontend` and `backend` directories.

### [System Architecture]

- **Data Ingestion:** A Python module to parse `.xlsx` or `.csv` files provided by Durian's ERP.
- **Content Engine:** A service using LangChain or similar to manage prompt templates for different tones (Home, Office, Custom).
- **Review UI:** A simple React-based dashboard to view, edit, and approve generated content.

### [Phase 1: MVP - Home Furniture Content Automation]

#### [NEW] [backend/main.py](file:///Users/adityasingh/Desktop/GHT/Durian/backend/main.py)
- FastAPI entry point for the API.
- Endpoints for uploading Excel, triggering generation, and fetching results.

#### [NEW] [backend/ingestion.py](file:///Users/adityasingh/Desktop/GHT/Durian/backend/ingestion.py)
- Logic to read product data from Excel files and map fields to internal data models.

#### [NEW] [backend/generator.py](file:///Users/adityasingh/Desktop/GHT/Durian/backend/generator.py)
- Gemini API integration.
- logic to generate: **Product Name, Small Description, Description, Design Story, Meta Description, Meta Keyword, Meta Tags, What You Need to Know**.
- Uses attributes like `Material Description`, `Primary Material`, `Style`, etc., from the Excel.

#### [NEW] [backend/feedback_store.py](file:///Users/adityasingh/Desktop/GHT/Durian/backend/feedback_store.py)
- Simple storage for "Liked" content to serve as few-shot examples for future generations.

#### [NEW] [frontend/index.html](file:///Users/adityasingh/Desktop/GHT/Durian/frontend/index.html)
- Main entry point for the web-based review tool.

#### [NEW] [frontend/src/App.jsx](file:///Users/adityasingh/Desktop/GHT/Durian/frontend/src/App.jsx)
- Dashboard to list SKUs and their content generation status.
- Side-by-side view for original data vs. AI-generated content.

## Verification Plan

### Automated Tests
- **Unit Tests:** Run `pytest` on `backend/ingestion.py` to ensure Excel fields are mapped correctly.
- **LLM Mocking:** Use `unittest.mock` to verify the generator sends the correct prompts without making actual API calls during CI.

### Manual Verification
- **Step 1:** Upload a sample Excel file (~10 Home Furniture SKUs).
- **Step 2:** Trigger content generation for the batch.
- **Step 3:** Open the Review UI and verify that:
    - Titles are brand-aligned.
    - Features match the specifications in the source data.
    - Tone is "aspirational/dreamy" for Home Furniture.
- **Step 4:** Edit one generated description and verify it saves correctly to the database.
- **Step 5:** Export the final content to JSON/CSV.
