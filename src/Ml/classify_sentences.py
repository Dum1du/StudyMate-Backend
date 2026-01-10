import sys
import json
import re
import traceback
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

# ==============================
# 1. TRAINING DATA (TEMP SAMPLE) - EXPANDED
# ==============================

# Label: 1 = good for quiz, 0 = not good
train_sentences = [
    # Good quiz sentences
    "The capital of France is Paris.",
    "Photosynthesis converts sunlight into chemical energy.",
    "JavaScript is a programming language.",
    "The human body has 206 bones.",
    "Einstein developed the theory of relativity.",
    "Water boils at 100 degrees Celsius.",
    "London is the capital of the United Kingdom.",
    "The Earth revolves around the Sun.",
    "Python is an interpreted programming language.",
    "The heart pumps blood throughout the body.",
    "Berlin is the capital of Germany.",
    "Rome is the capital of Italy.",
    "Madrid is the capital of Spain.",
    "Gravity causes objects to fall towards Earth.",
    "Newton discovered the laws of motion.",
    
    # Bad quiz sentences
    "Let's meet tomorrow for coffee.",
    "I think this is a good idea.",
    "Please open the window.",
    "Thanks for your help!",
    "Can we talk later?",
    "How are you doing today?",
    "I'll see you tomorrow.",
    "That sounds like a plan.",
    "Could you pass the salt?",
    "Let me know what you think.",
    "What time should we meet?",
    "Have a great day!",
    "I appreciate your help.",
    "Maybe we should try again.",
    "I don't know about that."
]

train_labels = [1] * 15 + [0] * 15  # 15 good, 15 bad

# ==============================
# 2. TEXT VECTORIZATION (SIMPLIFIED)
# ==============================

try:
    vectorizer = TfidfVectorizer(
        stop_words='english',
        ngram_range=(1, 1),  # Simpler: single words only
        max_features=200
    )
    X_train = vectorizer.fit_transform(train_sentences)
    print(f"Vectorizer created with {len(vectorizer.get_feature_names_out())} features", file=sys.stderr)
except Exception as e:
    print(f"Vectorizer error: {e}", file=sys.stderr)
    sys.exit(1)

# ==============================
# 3. CLASSIFIER (SIMPLIFIED)
# ==============================

try:
    classifier = LogisticRegression(
        max_iter=500,
        random_state=42,
        solver='liblinear'  # Faster solver
    )
    classifier.fit(X_train, train_labels)
    print("Classifier trained successfully", file=sys.stderr)
except Exception as e:
    print(f"Classifier error: {e}", file=sys.stderr)
    sys.exit(1)

# ==============================
# 4. RULE-BASED FEATURE EXTRACTOR (SIMPLIFIED)
# ==============================

def extract_features(sentence: str):
    """Simplified feature extraction without NLTK"""
    words = sentence.split()
    
    features = {
        "length": len(words),
        "has_fact_word": 0,
        "ends_with_period": 1 if sentence.strip().endswith('.') else 0,
        "starts_capital": 1 if sentence and sentence[0].isupper() else 0,
        "has_number": 1 if any(char.isdigit() for char in sentence) else 0,
        "has_capital_word": 1 if any(word[0].isupper() for word in words if len(word) > 1) else 0
    }
    
    # Check for fact words
    fact_words = ["is", "are", "was", "were", "has", "have", "contains", "includes", "means", "defined"]
    features["has_fact_word"] = 1 if any(word.lower() in fact_words for word in words) else 0
    
    return features

# ==============================
# 5. RECEIVE INPUT
# ==============================

if len(sys.argv) < 2:
    print(json.dumps([]))
    sys.exit(0)

try:
    input_sentences = json.loads(sys.argv[1])
    if not isinstance(input_sentences, list):
        print(json.dumps({"error": "Input must be a list of sentences"}))
        sys.exit(1)
        
    print(f"Processing {len(input_sentences)} sentences", file=sys.stderr)
    
except Exception as e:
    print(json.dumps({
        "error": f"Invalid input: {str(e)}",
        "hint": "Make sure to pass a JSON array of strings"
    }))
    sys.exit(1)

# ==============================
# 6. ML PREDICTION
# ==============================

try:
    X_new = vectorizer.transform(input_sentences)
    ml_probabilities = classifier.predict_proba(X_new)[:, 1]
    print(f"ML predictions computed for {len(input_sentences)} sentences", file=sys.stderr)
except Exception as e:
    print(json.dumps({"error": f"Prediction failed: {str(e)}"}))
    sys.exit(1)

# ==============================
# 7. HYBRID SCORING
# ==============================

selected = []

for i, sentence in enumerate(input_sentences):
    try:
        features = extract_features(sentence)
        
        # Rule score (0-1 scale)
        rule_score = (
            min(features["length"] / 25, 1.0) * 0.15 +          # Optimal length: ~15-25 words
            features["has_fact_word"] * 0.20 +
            features["ends_with_period"] * 0.15 +
            features["starts_capital"] * 0.10 +
            features["has_number"] * 0.15 +
            features["has_capital_word"] * 0.10
        )
        
        ml_score = float(ml_probabilities[i])
        
        # Combined score (weighted average)
        total_score = (ml_score * 0.6) + (rule_score * 0.4)
        
        if total_score >= 0.5:  # Lowered threshold
            selected.append({
                "sentence": sentence,
                "score": round(float(total_score), 3),
                "ml_score": round(float(ml_score), 3),
                "rule_score": round(float(rule_score), 3)
            })
            
    except Exception as e:
        print(f"Error processing sentence {i}: {e}", file=sys.stderr)
        continue

# ==============================
# 8. RETURN TOP RESULTS
# ==============================

selected.sort(key=lambda x: x["score"], reverse=True)

# Return top 7 sentences (or all if fewer)
top_count = min(7, len(selected))
top_sentences = [item["sentence"] for item in selected[:top_count]]

print(f"Selected {len(top_sentences)} sentences for quiz generation", file=sys.stderr)

# Also return debug info in development mode
if len(sys.argv) > 2 and sys.argv[2] == "--debug":
    output = {
        "selected": top_sentences,
        "details": selected[:top_count],
        "stats": {
            "total_input": len(input_sentences),
            "selected_count": len(selected),
            "vectorizer_features": len(vectorizer.get_feature_names_out())
        }
    }
    print(json.dumps(output, indent=2))
else:
    print(json.dumps(top_sentences))