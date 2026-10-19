export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, getRedirectResult, GoogleAuthProvider, signInWithCredential, signInWithPopup, signInWithRedirect, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
export { getFirestore, doc, getDoc, setDoc, updateDoc, getDocs, query, collection, orderBy, where } from 'firebase/firestore';
