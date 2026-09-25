# steelselect

A smart, application-focused tool for selecting the most suitable stainless steel grade based on engineering requirements, material properties, corrosion conditions, and cost considerations.

## Overview

Selecting the right stainless steel grade can be challenging because different applications require different combinations of strength, corrosion resistance, toughness, weldability, formability, operating temperature, and cost.

The **Stainless Steel Grade Selector** simplifies this process by allowing users to enter their application requirements and receive suitable stainless steel grade recommendations along with the key properties and trade-offs behind each recommendation.

The project is designed to help engineers, fabricators, students, procurement teams, and new stainless steel users make faster and more informed material-selection decisions.

## Key Features

### Application-Based Grade Recommendation
Users can specify their application and engineering requirements. The system evaluates available grades and recommends suitable options based on the selected criteria.

### Multi-Parameter Selection
The recommendation engine considers multiple material characteristics, including:

- Corrosion resistance
- Tensile strength
- Hardness
- Toughness
- Weldability
- Formability
- Cost
- PREN (Pitting Resistance Equivalent Number)
- Chemical composition

### Intelligent Ranking
Grades are ranked according to the importance of different properties for the selected application.

For example, corrosion resistance and toughness can be given greater importance for demanding environments, while formability and cost can receive greater weight for fabrication-oriented applications.

### Trade-Off Explanation
Instead of simply displaying a grade name, the application highlights why a grade was recommended and explains important trade-offs such as:

> Higher corrosion resistance ↔ Higher material cost

This helps users understand the reasoning behind the recommendation.

### PREN-Based Corrosion Assessment
The application uses PREN as an indicator of resistance to localized corrosion.

The calculation is based on:

**PREN = Cr + 3.3 × Mo + 16 × N**

where:

- Cr = Chromium content
- Mo = Molybdenum content
- N = Nitrogen content

Grades are additionally categorized using PREN-based corrosion-resistance levels.

### Application-Specific Weighting
Different applications require different material priorities.

The recommendation system can assign different weights to properties depending on the application, allowing the same database to support use cases across industries such as:

- Construction
- Infrastructure
- Machine components
- Shipbuilding
- Railways
- Automotive and mobility
- Process industries
- Renewable energy
- Architecture
- Consumer products

### User-Friendly Interface
The interface is designed for both technical and non-technical users, allowing users to explore stainless steel grades without requiring extensive knowledge of metallurgy.

## How the Recommendation Works

The basic recommendation workflow is:

```text
User Requirements
       ↓
Application Identification
       ↓
Requirement & Property Weighting
       ↓
Database Filtering
       ↓
Grade Scoring
       ↓
Multi-Grade Ranking
       ↓
Recommended Grades
       ↓
Property Comparison + Trade-Off Explanation
```

Each grade is evaluated against the user's requirements and assigned scores across relevant properties.

A simplified recommendation score can be represented as:

```text
Overall Score =
    Corrosion Score × Wc
  + Strength Score × Ws
  + Hardness Score × Wh
  + Toughness Score × Wt
  + Weldability Score × Ww
  + Formability Score × Wf
  + Cost Score × Wcost
```

Where the weights depend on the selected application and user requirements.

## Database

The application uses a structured stainless steel grade database containing information such as:

- Grade designation
- Common/alternate grade names
- Stainless steel family
- Chromium content
- Nickel content
- Molybdenum content
- Nitrogen content
- Carbon content
- Tensile strength
- Yield strength
- Hardness
- Toughness / Charpy impact energy
- PREN
- PREN index
- Weldability score
- Formability score
- Cost score
- Other relevant material properties

The database can be expanded to include additional grades, standards, suppliers, regions, and application-specific properties.

## AI-Assisted Mode

The project can be extended with an AI-powered mode for users who are unfamiliar with technical material-selection terminology.

Instead of requiring users to understand terms such as:

- UTS
- Yield Strength
- Brinell Hardness
- PREN
- Toughness

the AI interface can interpret natural-language requirements such as:

> "I need a stainless steel for an outdoor structure near the sea. It should resist corrosion, be easy to weld, and not be too expensive."

The AI converts the user's description into structured engineering requirements and passes them to the recommendation engine.

This creates a two-layer architecture:

```text
Natural Language User Input
          ↓
      AI Layer
          ↓
Structured Requirements
          ↓
Recommendation Engine
          ↓
Steel Grade Database
          ↓
Ranked Recommendations
```

The AI should assist with interpreting user requirements, while the actual material recommendation should remain grounded in the application's structured grade-property database.

## Technology Stack

The application is built as a modern web application.

Typical components include:

- **Frontend:** React / modern web UI
- **Styling:** CSS / Tailwind CSS
- **Database:** Structured steel-grade dataset
- **Recommendation Engine:** Rule-based / weighted scoring system
- **AI Layer:** API-based LLM integration
- **Deployment:** Vercel
- **Version Control:** GitHub

## Project Structure

A typical project structure is:

```text
steel-grade-selector/
│
├── public/
│   ├── logo/
│   └── assets/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── data/
│   ├── utils/
│   ├── services/
│   └── App.*
│
├── database/
│   └── stainless-steel-grades.*
│
├── README.md
├── package.json
└── ...
```

The exact structure may vary depending on the frontend framework and deployment configuration.

## Getting Started

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <PROJECT_FOLDER>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

The application should then be available at the local development URL shown in the terminal.

### 4. Build for production

```bash
npm run build
```

## Deployment

The application can be deployed using Vercel.

Typical deployment workflow:

```text
GitHub Repository
       ↓
      Vercel
       ↓
Production Build
       ↓
Live Web Application
```

Every update pushed to the connected repository can be deployed automatically.

## Design Philosophy

The application follows three key principles:

**1. Engineering relevance**

Recommendations should be based on measurable material properties and application requirements rather than simply popularity.

**2. Explainability**

Users should understand why a particular grade was recommended and what compromises are involved.

**3. Extensibility**

The system should allow new grades, properties, applications, standards, and recommendation logic to be added without rebuilding the entire application.

## Future Scope

The platform can be expanded with:

### AI-Powered Natural Language Selection
Allow users to describe their requirements in everyday language and automatically convert them into engineering parameters.

### Live Cost Intelligence
Incorporate regional and market-based stainless steel prices into the recommendation process.

### Inventory-Based Recommendations
Consider available grades, thicknesses, and inventory when generating recommendations.

### Global Standards Mapping
Map equivalent grades across standards such as:

- ASTM
- EN
- JIS
- UNS
- IS

### Expanded Application Coverage
Support additional industries and specialized applications.

### Continuous Learning
Use anonymized user feedback and historical selections to improve recommendation logic over time.

### Supplier Integration
Connect recommendations with supplier availability, product forms, dimensions, and lead times.

## Important Note

The recommendations provided by this application are intended to support material-selection decisions and should not replace engineering judgment, applicable standards, manufacturer specifications, testing, or professional consultation.

Material suitability can depend on factors such as:

- Actual operating environment
- Temperature
- Chloride concentration
- Mechanical loading
- Fabrication process
- Welding procedure
- Product form and thickness
- Applicable standards
- Surface finish
- Heat treatment
- Service life requirements

Users should verify the final material selection against the relevant engineering specifications and standards.

## Project Objective

The ultimate goal of the Stainless Steel Grade Selector is to make stainless steel selection:

**Faster → More understandable → More data-driven → More application-specific**

while reducing the risk of unnecessary over-specification or selecting a grade that is unsuitable for the intended service environment.

## License

Add the appropriate license and usage terms for your project before public distribution.

---

**Built as a smart material-selection platform for stainless steel applications.**

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
