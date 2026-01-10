import subprocess
import json
import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CLASSIFIER = os.path.join(BASE_DIR, "classify_sentences.py")
MCQ_GEN = os.path.join(BASE_DIR, "mcq_generator.py")

print("=" * 70)
print("FULL QUIZ GENERATION PIPELINE TEST")
print("=" * 70)

# -----------------------------
# Test Document with Related Concepts
# -----------------------------

test_document = [
    # Geography facts (these should help with "Paris" distractors)
    "The capital of France is Paris.",
    "London is the capital of the United Kingdom.",
    "Berlin is the capital of Germany.",
    "Rome is the capital of Italy.",
    "Madrid is the capital of Spain.",
    "Washington D.C. is the capital of the United States.",
    
    # Science facts
    "The human body has 206 bones.",
    "Water boils at 100 degrees Celsius at sea level.",
    "Photosynthesis converts sunlight into chemical energy.",
    "The Earth revolves around the Sun.",
    
    # Computer science
    "Python is an interpreted programming language.",
    "JavaScript was created by Brendan Eich.",
    
    # History/People
    "Einstein developed the theory of relativity.",
    "Shakespeare wrote Romeo and Juliet.",
    
    # Conversational (should be filtered out)
    "Let's meet tomorrow for coffee.",
    "Please open the window.",
    "Thanks for your help!",
    "I think this is a good idea.",
]

print(f"\n📚 Test Document: {len(test_document)} sentences")
print("\nSample of document content:")
for i, s in enumerate(test_document[:8], 1):
    print(f"  {i:2d}. {s}")
print("  ...")

# -----------------------------
# STEP 1: Sentence Classification
# -----------------------------

print("\n" + "=" * 70)
print("STEP 1: CLASSIFYING SENTENCES")
print("=" * 70)

try:
    # Run classifier (without --debug flag for normal output)
    classifier_result = subprocess.run(
        [sys.executable, CLASSIFIER, json.dumps(test_document)],
        capture_output=True,
        text=True,
        timeout=10
    )
    
    if classifier_result.returncode != 0:
        print(f"❌ Classifier failed with exit code: {classifier_result.returncode}")
        if classifier_result.stderr:
            print("Error output:", classifier_result.stderr[:500])
        sys.exit(1)
    
    # Parse selected sentences
    selected_sentences = json.loads(classifier_result.stdout.strip())
    
    print(f"✅ Selected {len(selected_sentences)} quiz-worthy sentences:")
    for i, s in enumerate(selected_sentences, 1):
        print(f"  {i:2d}. {s}")
    
    # Check if we have enough sentences
    if len(selected_sentences) < 3:
        print("⚠ Warning: Very few sentences selected. Adding some fallbacks...")
        # Add some fallback sentences
        fallbacks = [s for s in test_document if s not in selected_sentences]
        selected_sentences.extend(fallbacks[:5])
        print(f"  Added {5} fallback sentences")
    
except json.JSONDecodeError as e:
    print(f"❌ Failed to parse classifier output:")
    print(f"Raw output: {classifier_result.stdout[:500]}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Classifier failed: {e}")
    sys.exit(1)

# -----------------------------
# STEP 2: MCQ Generation
# -----------------------------

print("\n" + "=" * 70)
print("STEP 2: GENERATING MCQs")
print("=" * 70)

print(f"\nSending {len(selected_sentences)} sentences to MCQ generator...")

try:
    # Run MCQ generator
    mcq_result = subprocess.run(
        [sys.executable, MCQ_GEN, json.dumps(selected_sentences)],
        capture_output=True,
        text=True,
        timeout=30  # Give more time for embeddings
    )
    
    print(f"MCQ Generator exit code: {mcq_result.returncode}")
    
    # Show any warnings/errors
    if mcq_result.stderr:
        print("\nMCQ Generator logs:")
        lines = mcq_result.stderr.strip().split('\n')
        for line in lines:
            if line:  # Skip empty lines
                print(f"  {line}")
    
    # Parse results
    if mcq_result.returncode == 0 and mcq_result.stdout.strip():
        try:
            mcqs = json.loads(mcq_result.stdout.strip())
            
            if isinstance(mcqs, dict) and "error" in mcqs:
                print(f"\n❌ MCQ Generator returned error: {mcqs['error']}")
                sys.exit(1)
            
            print(f"\n✅ Successfully generated {len(mcqs)} MCQs!")
            
        except json.JSONDecodeError as e:
            print(f"\n❌ Failed to parse MCQ output as JSON:")
            print(f"Raw output (first 500 chars):")
            print(mcq_result.stdout[:500])
            sys.exit(1)
    else:
        print(f"\n❌ MCQ Generator failed or returned empty output")
        if mcq_result.stdout:
            print(f"Output: {mcq_result.stdout[:500]}")
        sys.exit(1)
        
except subprocess.TimeoutExpired:
    print("\n❌ MCQ Generator timed out after 30 seconds")
    print("The embedding model might be downloading or too slow.")
    print("\nTry running without embeddings first:")
    print("1. Edit mcq_generator.py and set USE_EMBEDDINGS = False")
    print("2. Or install sentence-transformers: pip install sentence-transformers")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ MCQ Generation failed: {e}")
    sys.exit(1)

# -----------------------------
# STEP 3: Display Results
# -----------------------------

print("\n" + "=" * 70)
print("FINAL QUIZ QUESTIONS")
print("=" * 70)

if len(mcqs) == 0:
    print("\n⚠ No MCQs generated. Possible issues:")
    print("  - Sentences might not have extractable answers")
    print("  - Embedding model might not be working")
    print("  - No good distractors found")
    
    # Try a simpler test
    print("\nTrying simple test with one sentence...")
    simple_test = ["The capital of France is Paris."]
    simple_result = subprocess.run(
        [sys.executable, MCQ_GEN, json.dumps(simple_test)],
        capture_output=True,
        text=True,
        timeout=10
    )
    
    if simple_result.returncode == 0:
        print("Simple test output:")
        print(simple_result.stdout[:500])
else:
    # Display all MCQs
    for i, q in enumerate(mcqs, 1):
        print(f"\nQ{i}: {q['question']}")
        options = q.get('options', [])
        answer = q.get('answer', '')
        
        for j, opt in enumerate(options):
            prefix = "✓" if opt == answer else " "
            print(f"  {prefix} {chr(97+j)}) {opt}")
    
    # Special analysis
    print("\n" + "=" * 70)
    print("ANALYSIS")
    print("=" * 70)
    
    # Check for "Paris" example
    paris_questions = [q for q in mcqs if 'Paris' in str(q)]
    if paris_questions:
        print(f"\n✅ Found {len(paris_questions)} question(s) about Paris:")
        for q in paris_questions:
            print(f"\n  Question: {q['question']}")
            print(f"  Answer: {q['answer']}")
            distractors = [opt for opt in q['options'] if opt != q['answer']]
            print(f"  Distractors: {distractors}")
            
            # Check if distractors are other capitals
            other_capitals = ['London', 'Berlin', 'Rome', 'Madrid', 'Washington']
            capital_distractors = [d for d in distractors if any(cap in str(d) for cap in other_capitals)]
            
            if capital_distractors:
                print(f"  ✅ Good! {len(capital_distractors)} distractors are other capitals")
            else:
                print(f"  ⚠ Distractors are not other capitals (might need more context in document)")
    else:
        print("\n⚠ No Paris-related questions found")
    
    # Check numeric questions
    numeric_questions = [q for q in mcqs if any(char.isdigit() for char in str(q.get('answer', '')))]
    if numeric_questions:
        print(f"\n✅ Found {len(numeric_questions)} numeric question(s):")
        for q in numeric_questions[:3]:  # Show first 3
            print(f"  {q['question']} → {q['answer']}")

# -----------------------------
# STEP 4: Quick Debug Test
# -----------------------------

print("\n" + "=" * 70)
print("QUICK DEBUG TEST")
print("=" * 70)

print("\nTesting MCQ generator with minimal input...")
minimal_test = ["Paris is the capital of France.", "London is capital of UK."]

try:
    debug_result = subprocess.run(
        [sys.executable, MCQ_GEN, json.dumps(minimal_test)],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    print(f"Exit code: {debug_result.returncode}")
    
    if debug_result.stderr:
        print("Error output:")
        for line in debug_result.stderr.split('\n'):
            if line and 'Loading embedding' not in line:
                print(f"  {line}")
    
    if debug_result.stdout:
        print("\nGenerated MCQs:")
        try:
            debug_mcqs = json.loads(debug_result.stdout)
            for q in debug_mcqs:
                print(f"  Q: {q.get('question', 'N/A')}")
                print(f"  A: {q.get('answer', 'N/A')}")
                print(f"  Options: {q.get('options', [])}")
                print()
        except:
            print(f"Raw output: {debug_result.stdout[:300]}")
            
except Exception as e:
    print(f"Debug test failed: {e}")

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)

# -----------------------------
# STEP 5: Test with Embeddings
# -----------------------------

print("\n" + "=" * 70)
print("TESTING WITH EMBEDDINGS INSTALLED")
print("=" * 70)

print("\nInstalling sentence-transformers if needed...")
try:
    import sentence_transformers
    print("✓ sentence-transformers already installed")
except ImportError:
    print("Installing... (this may take a minute)")
    import subprocess
    install_result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "sentence-transformers"],
        capture_output=True,
        text=True
    )
    if install_result.returncode == 0:
        print("✓ Installed successfully")
    else:
        print("✗ Installation failed")

# Test with a focused document
print("\nTesting improved MCQ generation...")
focused_document = [
    "Paris is the capital of France.",
    "London is the capital of the United Kingdom.", 
    "Berlin is the capital of Germany.",
    "Rome is the capital of Italy.",
    "Madrid is the capital of Spain.",
    "The human body has 206 bones.",
    "Water boils at 100 degrees Celsius."
]

print("\nTest document:")
for s in focused_document:
    print(f"  - {s}")

# Run through pipeline
try:
    # Classify
    classify_result = subprocess.run(
        [sys.executable, CLASSIFIER, json.dumps(focused_document)],
        capture_output=True,
        text=True,
        timeout=10
    )
    
    if classify_result.returncode == 0:
        selected = json.loads(classify_result.stdout)
        print(f"\nSelected {len(selected)} sentences")
        
        # Generate MCQs with new improved generator
        mcq_result = subprocess.run(
            [sys.executable, "mcq_generator.py", json.dumps(selected)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        print(f"\nMCQ Generator exit code: {mcq_result.returncode}")
        
        if mcq_result.stderr:
            for line in mcq_result.stderr.split('\n'):
                if line and 'Loading' in line:
                    print(f"  {line}")
        
        if mcq_result.returncode == 0 and mcq_result.stdout:
            try:
                mcqs = json.loads(mcq_result.stdout)
                print(f"\n✅ Generated {len(mcqs)} MCQs with improved logic:")
                
                for i, q in enumerate(mcqs, 1):
                    print(f"\nQ{i}: {q['question']}")
                    options = q.get('options', [])
                    answer = q.get('answer', '')
                    
                    for j, opt in enumerate(options):
                        prefix = "✓" if opt == answer else " "
                        print(f"  {prefix} {chr(97+j)}) {opt}")
                    
                    # Check for Paris question
                    if 'Paris' in q.get('original_sentence', ''):
                        print(f"  [Paris question - check distractors]")
                        distractors = [opt for opt in options if opt != answer]
                        capital_distractors = [d for d in distractors if any(c in str(d) for c in ['London', 'Berlin', 'Rome', 'Madrid'])]
                        if capital_distractors:
                            print(f"  ✅ Good! Distractors include other capitals: {capital_distractors}")
                        else:
                            print(f"  ⚠ Distractors: {distractors}")
                            
            except json.JSONDecodeError:
                print(f"Raw output: {mcq_result.stdout[:500]}")
                
except Exception as e:
    print(f"\nTest failed: {e}")

print("\n" + "=" * 70)
print("RECOMMENDATIONS")
print("=" * 70)
print("\n1. Install embeddings for better results:")
print("   pip install sentence-transformers")
print("\n2. For capital cities questions, include more countries in the document")
print("\n3. The improved logic should now:")
print("   - Create proper questions (not '____ is Paris')")
print("   - Generate better distractors from same category")
print("   - Avoid duplicate options")