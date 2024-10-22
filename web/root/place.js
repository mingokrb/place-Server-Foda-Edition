class Place {
	#loaded;
	#socket;
	#loadingp;
	#uiwrapper;
	#glWindow;
	#allowDraw;

	constructor(glWindow) {
		this.#loaded = false;
		this.#socket = null;
		this.#loadingp = document.querySelector("#loading-p");
		this.#uiwrapper = document.querySelector("#ui-wrapper");
		this.#glWindow = glWindow;
		this.#allowDraw = null;
	}

	initConnection() {
		this.#loadingp.innerHTML = "conectando";

		let host = window.location.hostname;
		let port = window.location.port;
		if (port != "") {
			host += ":" + port;
		}

		let wsProt;
		if (window.location.protocol == "https:") {
			wsProt = "wss:";
		} else {
			wsProt = "ws:";
		}

		this.#connect(wsProt + "//" + host + "/ws");
		this.#loadingp.innerHTML = "baixando canvas";

		fetch(window.location.protocol + "//" + host + "/place.png")
			.then(async resp => {
				if (!resp.ok) {
					console.error("Erro ao baixar canvas.");
					return null;
				}

				let buf = await this.#downloadProgress(resp);
				await this.#setImage(buf);

				this.#loaded = true;
				this.#loadingp.innerHTML = "";
				this.#uiwrapper.setAttribute("hide", true);
			});
	}

	async #downloadProgress(resp) {
		let len = resp.headers.get("Content-Length");
		let a = new Uint8Array(len);
		let pos = 0;
		let reader = resp.body.getReader();
		while (true) {
			let { done, value } = await reader.read();
			if (value) {
				a.set(value, pos);
				pos += value.length;
				this.#loadingp.innerHTML = "baixando mapa (" + Math.round(pos / len * 100) + "%)";
			}
			if (done) break;
		}
		return a;
	}

	#connect(path) {
		this.#socket = new WebSocket(path);

		const socketMessage = async (event) => {
			let b = await event.data.arrayBuffer();
			if (this.#allowDraw == null) {
				let view = new DataView(b);
				this.#allowDraw = view.getUint8(0) === 1;
				if (!this.#allowDraw) {
					this.#keyPrompt();
				}
			} else {
				this.#handleSocketSetPixel(b);
			}
		};

		const socketClose = (event) => {
			this.#socket = null;
		};

		const socketError = (event) => {
			console.error("Erro ao conectar ao WebSocket.");
			alert("Falha ao conectar.");
			this.#socket.close();
		};

		this.#socket.addEventListener("message", socketMessage);
		this.#socket.addEventListener("close", socketClose);
		this.#socket.addEventListener("error", socketError);
	}

	setPixel(x, y, color) {
		if (!this.#allowDraw) {
			return;
		}
		if (this.#socket != null && this.#socket.readyState == 1) {
			let b = new Uint8Array(11);
			this.#putUint32(b.buffer, 0, x);
			this.#putUint32(b.buffer, 4, y);
			for (let i = 0; i < 3; i++) {
				b[8 + i] = color[i];
			}
			this.#socket.send(b);
			this.#glWindow.setPixelColor(x, y, color);
			this.#glWindow.draw();
		} else {
			alert("Desconectado.");
			console.error("Desconectado.");
		}
	}

	#handleSocketSetPixel(b) {
		if (this.#loaded) {
			let x = this.#getUint32(b, 0);
			let y = this.#getUint32(b, 4);
			let color = new Uint8Array(b.slice(8));
			this.#glWindow.setPixelColor(x, y, color);
			this.#glWindow.draw();
		}
	}

	async #setImage(data) {
		let img = new Image()
		let blob = new Blob([data], { type: "image/png" });
		let blobUrl = URL.createObjectURL(blob);
		img.src = blobUrl;
		let promise = new Promise((resolve, reject) => {
			img.onload = () => {
				this.#glWindow.setTexture(img);
				this.#glWindow.draw();
				resolve();
			};
			img.onerror = reject;
		});
		await promise;
	}

	#putUint32(b, offset, n) {
		let view = new DataView(b);
		view.setUint32(offset, n, false);
	}

	#getUint32(b, offset) {
		let view = new DataView(b);
		return view.getUint32(offset, false);
	}

	#keyPrompt() {
		let key = prompt("Este canvas utiliza uma lista branca.\n\nSe você não tiver uma chave, você ainda poderá ver o canvas, mas não poderá desenhar.\n\nPara pedir uma chave de acesso, você pode criar uma issue no projeto do GitHub.\n\nSe você já tiver uma, insira ela aqui.", "");
		fetch("./verifykey?key="+key)
			.then(async resp => {
				if (resp.ok) {
					window.location.reload();
				} else {
					alert("Chave inválida.")
				}
			});
	}
}
