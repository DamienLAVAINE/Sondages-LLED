import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
    import {
      getAuth, signInAnonymously, onAuthStateChanged
    } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
    import {
      getFirestore, collection, addDoc, doc, setDoc, deleteDoc,
      updateDoc, onSnapshot, serverTimestamp
    } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

    // Configuration Firebase du projet LLED.
    const firebaseConfig = {
  apiKey: "AIzaSyCEMp5cysZsALaZy9EwCLuHXtG12Pkyg0M",
  authDomain: "lled-vote.firebaseapp.com",
  projectId: "lled-vote",
  storageBucket: "lled-vote.firebasestorage.app",
  messagingSenderId: "819365129476",
  appId: "1:819365129476:web:2662e25800bc4bb2903451",
  measurementId: "G-N336X6D2LP"


      
    };

    const STATUSES = [
      "À découvrir", "À travailler", "Au répertoire", "Refusé"
    ];

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const $ = id => document.getElementById(id);
    let currentUser = null;
    let songs = [];
    const ratingsBySong = new Map();
    const ratingUnsubscribe = new Map();

    const nicknameInput = $("nickname");
    nicknameInput.value = localStorage.getItem("lledNickname") || "";

    nicknameInput.addEventListener("change", () => {
      const name = nicknameInput.value.trim().slice(0, 40);
      nicknameInput.value = name;
      localStorage.setItem("lledNickname", name);
      renderSongs();
    });

    function nickname() {
      return nicknameInput.value.trim().slice(0, 40) || "Membre";
    }

    function showMessage(message, type = "") {
      const el = $("message");
      el.textContent = message;
      el.className = type;
    }

    function safeUrl(value) {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
      } catch {
        return "";
      }
    }

    function ratingInfo(songId) {
      const ratings = [...(ratingsBySong.get(songId)?.values() || [])];
      const average = ratings.length
        ? ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length
        : null;
      const mine = currentUser
        ? ratings.find(item => item.uid === currentUser.uid)?.rating ?? null
        : null;
      return { ratings, average, count: ratings.length, mine };
    }

    function starButtons(songId, mine) {
      const wrap = document.createElement("div");
      wrap.className = "stars";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", "Noter ce morceau de 1 à 5 étoiles");

      for (let n = 1; n <= 5; n++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "star" + (mine !== null && n <= mine ? " my-rating" : "");
        btn.textContent = n <= (mine || 0) ? "★" : "☆";
        btn.setAttribute("aria-label", `${n} sur 5`);
        btn.title = `Attribuer ${n}/5`;
        btn.addEventListener("click", () => saveRating(songId, n));
        wrap.appendChild(btn);
      }
      return wrap;
    }

    function renderRanking() {
      const root = $("rankingList");
      if (!root) return;
      root.replaceChildren();

      const ranked = songs.map(song => {
        const info = ratingInfo(song.id);
        return { song, ...info };
      }).sort((a, b) => {
        if (a.average === null && b.average !== null) return 1;
        if (b.average === null && a.average !== null) return -1;
        return (b.average ?? 0) - (a.average ?? 0)
          || b.count - a.count
          || a.song.title.localeCompare(b.song.title, "fr");
      });

      if (!ranked.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Le classement apparaîtra dès qu'un morceau sera proposé.";
        root.appendChild(empty);
        return;
      }

      ranked.forEach(({ song, average, count }, index) => {
        const item = document.createElement("div");
        item.className = "ranking-item";

        const heading = document.createElement("div");
        heading.className = "ranking-heading";

        const title = document.createElement("div");
        title.className = "ranking-title";
        title.textContent = `${index + 1}. ${song.title} — ${song.artist}`;

        const meta = document.createElement("div");
        meta.className = "ranking-meta";
        meta.textContent = average === null
          ? `Pas encore noté · 0 vote`
          : `${average.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${count} ${count > 1 ? "votes" : "vote"}`;

        heading.append(title, meta);

        const track = document.createElement("div");
        track.className = "ranking-track";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `Moyenne de ${song.title}`);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "5");
        track.setAttribute("aria-valuenow", String(average ?? 0));

        const bar = document.createElement("div");
        bar.className = "ranking-bar";
        bar.style.width = `${average === null ? 0 : (average / 5) * 100}%`;
        track.appendChild(bar);

        const subtitle = document.createElement("div");
        subtitle.className = "ranking-subtitle";
        subtitle.textContent = average === null
          ? "En attente des premières notes"
          : `${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}  ·  ${count} note(s) prise(s) en compte`;

        item.append(heading, track, subtitle);
        root.appendChild(item);
      });
    }

    function renderSongs() {
      renderRanking();
      const root = $("songList");
      root.replaceChildren();

      const filter = $("filterStatus").value;
      const sort = $("sortBy").value;

      let visible = songs.filter(song =>
        filter === "Tous" || song.status === filter
      );

      const infoFor = song => ratingInfo(song.id);

      visible.sort((a, b) => {
        if (sort === "rating") {
          const ar = infoFor(a), br = infoFor(b);
          if (ar.average === null && br.average !== null) return 1;
          if (br.average === null && ar.average !== null) return -1;
          return (br.average ?? 0) - (ar.average ?? 0)
            || br.count - ar.count
            || a.title.localeCompare(b.title, "fr");
        }
        if (sort === "count") {
          const difference = infoFor(b).count - infoFor(a).count;
          return difference || a.title.localeCompare(b.title, "fr");
        }
        if (sort === "title") {
          return a.title.localeCompare(b.title, "fr");
        }
        return (b.createdAt?.toMillis?.() ?? 0)
          - (a.createdAt?.toMillis?.() ?? 0);
      });

      if (!visible.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = songs.length
          ? "Aucun morceau pour ce filtre."
          : "Aucun morceau pour le moment. Soyez les premiers à proposer une chanson !";
        root.appendChild(empty);
        return;
      }

      for (const song of visible) {
        const info = infoFor(song);
        const card = document.createElement("article");
        card.className = "song";

        const top = document.createElement("div");
        top.className = "song-top";

        const titleBlock = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = song.title;
        const artist = document.createElement("div");
        artist.className = "artist";
        artist.textContent = song.artist;
        const proposer = document.createElement("div");
        proposer.className = "hint";
        proposer.textContent = `Proposé par ${song.proposedBy || "un membre"}`;

        titleBlock.append(title, artist, proposer);

        const status = document.createElement("span");
        status.className = "badge";
        status.textContent = song.status || "À découvrir";
        top.append(titleBlock, status);
        card.appendChild(top);

        const url = safeUrl(song.link || "");
        if (url) {
          const link = document.createElement("a");
          link.className = "song-link";
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "▶ Écouter le morceau";
          card.appendChild(link);
        }

        const ratingArea = document.createElement("div");
        ratingArea.className = "rating-area";

        const summary = document.createElement("div");
        summary.className = "rating-summary";

        const average = document.createElement("span");
        average.className = "average";
        average.textContent = info.average === null
          ? "Pas encore noté"
          : `${info.average.toLocaleString("fr-FR", {
              minimumFractionDigits: 1, maximumFractionDigits: 1
            })}/5`;

        const count = document.createElement("span");
        count.className = "muted";
        count.textContent = `(${info.count} ${info.count > 1 ? "notes" : "note"})`;

        summary.append(average, count);
        if (info.average !== null) {
          const averageStars = document.createElement("span");
          averageStars.className = "muted";
          averageStars.textContent = "★".repeat(Math.round(info.average))
            + "☆".repeat(5 - Math.round(info.average));
          summary.appendChild(averageStars);
        }

        const prompt = document.createElement("div");
        prompt.className = "hint";
        prompt.style.marginTop = "10px";
        prompt.textContent = "Ta note :";

        ratingArea.append(summary, prompt, starButtons(song.id, info.mine));

        if (info.mine !== null) {
          const mine = document.createElement("div");
          mine.className = "my-note";
          mine.textContent = `Tu as attribué ${info.mine}/5. Tu peux cliquer sur une autre étoile pour modifier ta note.`;

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "secondary";
          remove.style.marginTop = "8px";
          remove.textContent = "Retirer ma note";
          remove.addEventListener("click", () => removeRating(song.id));

          ratingArea.append(mine, remove);
        } else {
          const help = document.createElement("div");
          help.className = "my-note";
          help.textContent = "Clique sur une étoile pour noter ce morceau.";
          ratingArea.appendChild(help);
        }

        card.appendChild(ratingArea);

        const actions = document.createElement("div");
        actions.className = "song-actions";

        if (currentUser && song.proposerUid === currentUser.uid) {
          const statusSelect = document.createElement("select");
          statusSelect.className = "status";
          statusSelect.setAttribute("aria-label", "Modifier le statut");

          for (const value of STATUSES) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            option.selected = (song.status || "À découvrir") === value;
            statusSelect.appendChild(option);
          }

          statusSelect.addEventListener("change", async () => {
            try {
              await updateDoc(doc(db, "songs", song.id), {
                status: statusSelect.value
              });
              showMessage("Statut mis à jour.", "success");
            } catch (error) {
              console.error(error);
              showMessage("Impossible de modifier le statut. Vérifie les règles Firebase.", "error");
            }
          });

          const del = document.createElement("button");
          del.type = "button";
          del.className = "danger";
          del.textContent = "Supprimer ma proposition";
          del.addEventListener("click", async () => {
            if (!confirm(`Supprimer « ${song.title} » ?`)) return;
            try {
              await deleteDoc(doc(db, "songs", song.id));
              showMessage("Proposition supprimée.", "success");
            } catch (error) {
              console.error(error);
              showMessage("Suppression impossible. Vérifie les règles Firebase.", "error");
            }
          });

          actions.append(statusSelect, del);
          card.appendChild(actions);
        }

        root.appendChild(card);
      }
    }

    async function saveRating(songId, rating) {
      if (!currentUser) {
        showMessage("Connexion en cours, réessaie dans un instant.");
        return;
      }

      try {
        const ratingRef = doc(db, "songs", songId, "ratings", currentUser.uid);
        await setDoc(ratingRef, {
          uid: currentUser.uid,
          nickname: nickname(),
          rating,
          updatedAt: serverTimestamp()
        });
        showMessage(`Ta note de ${rating}/5 a été enregistrée.`, "success");
      } catch (error) {
        console.error(error);
        showMessage("Impossible d'enregistrer la note. Vérifie la connexion et les règles Firebase.", "error");
      }
    }

    async function removeRating(songId) {
      if (!currentUser) return;
      try {
        await deleteDoc(doc(db, "songs", songId, "ratings", currentUser.uid));
        showMessage("Ta note a été retirée.", "success");
      } catch (error) {
        console.error(error);
        showMessage("Impossible de retirer ta note.", "error");
      }
    }

    $("songForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (!currentUser) {
        showMessage("Connexion en cours, réessaie dans un instant.");
        return;
      }

      const title = $("title").value.trim();
      const artist = $("artist").value.trim();
      const rawLink = $("link").value.trim();
      const link = rawLink ? safeUrl(rawLink) : "";

      if (!title || !artist) {
        showMessage("Le titre et l'artiste sont obligatoires.", "error");
        return;
      }
      if (rawLink && !link) {
        showMessage("Le lien doit commencer par https:// ou http://.", "error");
        return;
      }

      const submit = $("songForm").querySelector('button[type="submit"]');
      submit.disabled = true;

      try {
        await addDoc(collection(db, "songs"), {
          title,
          artist,
          link,
          proposedBy: nickname(),
          proposerUid: currentUser.uid,
          status: "À découvrir",
          createdAt: serverTimestamp()
        });
        $("songForm").reset();
        showMessage("Morceau ajouté à la liste !", "success");
      } catch (error) {
        console.error(error);
        showMessage("Impossible d'ajouter le morceau. Vérifie les règles Firebase.", "error");
      } finally {
        submit.disabled = false;
      }
    });

    $("filterStatus").addEventListener("change", renderSongs);
    $("sortBy").addEventListener("change", renderSongs);

    function watchRatings(songId) {
      if (ratingUnsubscribe.has(songId)) return;

      const unsubscribe = onSnapshot(
        collection(db, "songs", songId, "ratings"),
        snapshot => {
          const map = new Map();
          snapshot.forEach(item => {
            const data = item.data();
            if (Number.isInteger(data.rating) && data.rating >= 1 && data.rating <= 5) {
              map.set(item.id, data);
            }
          });
          ratingsBySong.set(songId, map);
          renderSongs();
        },
        error => {
          console.error(error);
          showMessage("Erreur de lecture des notes. Vérifie les règles Firestore.", "error");
        }
      );

      ratingUnsubscribe.set(songId, unsubscribe);
    }

    function watchSongs() {
      onSnapshot(
        collection(db, "songs"),
        snapshot => {
          songs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));

          const currentIds = new Set(songs.map(song => song.id));

          for (const [id, unsubscribe] of ratingUnsubscribe.entries()) {
            if (!currentIds.has(id)) {
              unsubscribe();
              ratingUnsubscribe.delete(id);
              ratingsBySong.delete(id);
            }
          }

          for (const song of songs) watchRatings(song.id);
          renderSongs();
          showMessage(`${songs.length} morceau(x) dans la liste.`, "success");
        },
        error => {
          console.error(error);
          showMessage("Impossible de charger la liste. Vérifie Firebase et les règles Firestore.", "error");
        }
      );
    }

    try {
      await signInAnonymously(auth);
      onAuthStateChanged(auth, user => {
        currentUser = user;
        if (user) watchSongs();
      });
    } catch (error) {
      console.error(error);
      showMessage("Connexion Firebase impossible. Vérifie que l'authentification anonyme est activée et que la configuration est correcte.", "error");
    }
