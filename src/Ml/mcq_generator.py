import re
import json
import sys
import random
import traceback
from collections import defaultdict
from typing import List, Dict, Optional, Tuple
import numpy as np

# ==============================
# 1. Embedding Model (FIXED with better fallback)
# ==============================
try:
    from sentence_transformers import SentenceTransformer
    print("Loading embedding model...", file=sys.stderr)
    model = SentenceTransformer('all-MiniLM-L6-v2')
    USE_EMBEDDINGS = True
    print("✓ Embedding model loaded", file=sys.stderr)
except ImportError:
    print("⚠ sentence-transformers not installed. Run: pip install sentence-transformers", file=sys.stderr)
    USE_EMBEDDINGS = False
    model = None
except Exception as e:
    print(f"⚠ Could not load embedding model: {e}", file=sys.stderr)
    USE_EMBEDDINGS = False
    model = None

# ==============================
# 2. IMPROVED ANSWER EXTRACTION
# ==============================
def extract_answer_and_question(sentence: str) -> Optional[Tuple[str, str]]:
    """
    Extract answer and create proper question.
    Returns: (answer, question_with_blank)
    """
    sentence = sentence.strip()
    
    # Pattern 1: "X is the capital of Y" → Answer: Y, Question: "X is the capital of ____"
    match = re.search(r'([A-Z][a-zA-Z\s\.]+?)\s+is\s+(?:the\s+)?capital\s+of\s+([A-Z][a-zA-Z\s]+?)\.?$', sentence, re.IGNORECASE)
    if match:
        capital = match.group(1).strip()
        country = match.group(2).strip()
        # Determine which is the answer (usually the capital)
        if len(capital.split()) <= 3:  # Capital is simpler
            return capital, sentence.replace(capital, "____")
        else:
            return country, sentence.replace(country, "____")
    
    # Pattern 2: "The capital of Y is X" → Answer: X, Question: "The capital of Y is ____"
    match = re.search(r'The\s+capital\s+of\s+([A-Z][a-zA-Z\s]+?)\s+is\s+([A-Z][a-zA-Z\s\.]+?)\.?$', sentence, re.IGNORECASE)
    if match:
        country = match.group(1).strip()
        capital = match.group(2).strip()
        return capital, sentence.replace(capital, "____")
    
    # Pattern 3: "X has/have Y bones/units/etc" → Answer: Y (number), Question: "X has ____ bones"
    match = re.search(r'([A-Z][a-zA-Z\s]+?)\s+has\s+(\d+)\s+([a-z]+)', sentence, re.IGNORECASE)
    if match:
        number = match.group(2)
        return number, sentence.replace(number, "____")
    
    # Pattern 4: "There are X Y in Z" → Answer: X, Question: "There are ____ Y in Z"
    match = re.search(r'There\s+are\s+(\d+)\s+([a-z]+)', sentence, re.IGNORECASE)
    if match:
        number = match.group(1)
        return number, sentence.replace(number, "____")
    
    # Pattern 5: "X is Y" (general fact) → Answer: Y, Question: "X is ____"
    match = re.search(r'([A-Z][a-zA-Z\s]+?)\s+is\s+([A-Za-z][a-zA-Z\s]+?)\.?$', sentence)
    if match:
        subject = match.group(1).strip()
        predicate = match.group(2).strip()
        # Choose the shorter one as answer (usually more specific)
        if len(predicate.split()) <= len(subject.split()):
            return predicate, sentence.replace(predicate, "____")
        else:
            return subject, sentence.replace(subject, "____")
    
    return None

# ==============================
# 3. IMPROVED KNOWLEDGE GRAPH
# ==============================
class DocumentKnowledgeGraph:
    def __init__(self, all_sentences: List[str]):
        self.all_sentences = all_sentences
        self.concepts = set()
        self.concept_categories = defaultdict(set)  # e.g., 'capital': {'Paris', 'London'}
        self.concept_embeddings = {}
        self.build_graph()
    
    def extract_concepts_with_categories(self, sentence: str):
        """Extract concepts and categorize them"""
        concepts = []
        
        # Capitals and countries
        capital_match = re.search(r'([A-Z][a-zA-Z\s\.]+?)\s+is\s+(?:the\s+)?capital\s+of\s+([A-Z][a-zA-Z\s]+?)', sentence, re.IGNORECASE)
        if capital_match:
            capital = capital_match.group(1).strip().lower()
            country = capital_match.group(2).strip().lower()
            self.concept_categories['capital'].add(capital)
            self.concept_categories['country'].add(country)
            concepts.extend([capital, country])
        
        # Numbers
        numbers = re.findall(r'\b\d+\b', sentence)
        for num in numbers:
            self.concept_categories['number'].add(num)
            concepts.append(num)
        
        # Proper nouns (single words)
        proper_nouns = re.findall(r'\b[A-Z][a-z]+\b', sentence)
        for noun in proper_nouns:
            noun_lower = noun.lower()
            concepts.append(noun_lower)
        
        # Key noun phrases (2-3 words)
        noun_phrases = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b', sentence)
        for phrase in noun_phrases:
            phrase_lower = phrase.lower()
            concepts.append(phrase_lower)
        
        return list(set(concepts))
    
    def build_graph(self):
        for sentence in self.all_sentences:
            concepts = self.extract_concepts_with_categories(sentence)
            self.concepts.update(concepts)
        
        # Create embeddings if available
        if USE_EMBEDDINGS and model and self.concepts:
            try:
                concept_list = list(self.concepts)
                embeddings = model.encode(concept_list)
                self.concept_embeddings = dict(zip(concept_list, embeddings))
            except Exception as e:
                print(f"Embedding creation failed: {e}", file=sys.stderr)
    
    def get_best_distractors(self, answer: str, answer_category: str = None) -> List[str]:
        """Get the best distractors for an answer"""
        answer_lower = answer.lower()
        distractors = []
        
        # Strategy 1: Same category distractors
        if answer_category and answer_category in self.concept_categories:
            same_category = list(self.concept_categories[answer_category])
            random.shuffle(same_category)
            for concept in same_category:
                if concept != answer_lower and concept not in distractors:
                    distractors.append(self.format_concept(concept, answer))
                    if len(distractors) >= 3:
                        return distractors
        
        # Strategy 2: Embedding-based distractors
        if USE_EMBEDDINGS and answer_lower in self.concept_embeddings:
            embedding_dists = self.get_embedding_distractors(answer_lower)
            for dist in embedding_dists:
                if dist not in distractors:
                    distractors.append(dist)
                if len(distractors) >= 3:
                    return distractors
        
        # Strategy 3: Random concepts from document
        all_concepts = list(self.concepts)
        random.shuffle(all_concepts)
        for concept in all_concepts:
            if concept != answer_lower and concept not in distractors:
                distractors.append(self.format_concept(concept, answer))
                if len(distractors) >= 3:
                    break
        
        return distractors[:3]
    
    def get_embedding_distractors(self, answer: str) -> List[str]:
        """Get distractors using semantic similarity"""
        if answer not in self.concept_embeddings:
            return []
        
        answer_emb = self.concept_embeddings[answer]
        similarities = []
        
        for concept, emb in self.concept_embeddings.items():
            if concept == answer:
                continue
            
            # Calculate cosine similarity
            similarity = np.dot(answer_emb, emb) / (np.linalg.norm(answer_emb) * np.linalg.norm(emb))
            
            # Good distractors: somewhat related (0.3-0.7 similarity)
            if 0.3 < similarity < 0.7:
                similarities.append((concept, similarity))
        
        # Sort by similarity (closest to 0.5 is best)
        similarities.sort(key=lambda x: abs(x[1] - 0.5))
        
        return [self.format_concept(concept, answer) for concept, _ in similarities[:3]]
    
    def format_concept(self, concept: str, answer: str) -> str:
        """Format concept similar to answer (title case, etc.)"""
        if answer[0].isupper():
            return concept.title()
        return concept

# ==============================
# 4. IMPROVED MCQ GENERATION
# ==============================
def generate_mcq(sentence: str, knowledge_graph: DocumentKnowledgeGraph) -> Optional[Dict]:
    """Generate a single MCQ"""
    
    # Extract answer and question
    result = extract_answer_and_question(sentence)
    if not result:
        return None
    
    answer, question = result
    
    # Determine answer category for better distractors
    answer_category = None
    answer_lower = answer.lower()
    
    # Check categories
    for category, concepts in knowledge_graph.concept_categories.items():
        if answer_lower in concepts:
            answer_category = category
            break
    
    # Get distractors
    distractors = knowledge_graph.get_best_distractors(answer, answer_category)
    
    # Ensure we have 3 unique distractors
    distractors = list(set(distractors))
    
    # Remove any distractor that's too similar to answer
    distractors = [d for d in distractors if d.lower() != answer_lower]
    
    # If not enough distractors, add generic ones
    while len(distractors) < 3:
        if answer_category == 'number' and answer.isdigit():
            num = int(answer)
            new_dist = str(num + random.randint(5, 20))
            if new_dist not in distractors:
                distractors.append(new_dist)
        else:
            generic = ["Unknown", "Not sure", "None of the above"]
            for g in generic:
                if g not in distractors and len(distractors) < 3:
                    distractors.append(g)
    
    # Create options
    options = distractors[:3] + [answer]
    random.shuffle(options)
    
    return {
        "question": question,
        "options": options,
        "answer": answer,
        "original_sentence": sentence
    }

# ==============================
# 5. MAIN FUNCTION
# ==============================
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No sentences provided"}))
        return
    
    try:
        # Get sentences
        sentences = json.loads(sys.argv[1])
        if not isinstance(sentences, list) or len(sentences) == 0:
            print(json.dumps({"error": "Invalid input format"}))
            return
        
        print(f"Processing {len(sentences)} sentences...", file=sys.stderr)
        
        # Build knowledge graph
        knowledge_graph = DocumentKnowledgeGraph(sentences)
        print(f"Extracted {len(knowledge_graph.concepts)} concepts", file=sys.stderr)
        
        # Generate MCQs
        mcqs = []
        for sentence in sentences:
            mcq = generate_mcq(sentence, knowledge_graph)
            if mcq:
                mcqs.append(mcq)
        
        # Remove duplicates (same question)
        unique_mcqs = []
        seen_questions = set()
        for mcq in mcqs:
            if mcq["question"] not in seen_questions:
                seen_questions.add(mcq["question"])
                unique_mcqs.append(mcq)
        
        print(f"Generated {len(unique_mcqs)} unique MCQs", file=sys.stderr)
        print(json.dumps(unique_mcqs, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "trace": traceback.format_exc()
        }))

if __name__ == "__main__":
    main()