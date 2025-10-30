class Map3D {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.buildings = [];
        this.labels = [];
        this.activeRoutes = ['historical']; // Активные маршруты (можно несколько)
        this.buildingsData = null;
        this.animationId = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredBuilding = null;
        this.labelDiv = null;
        
        // Анимированные объекты
        this.train = null;
        this.plane = null;
        this.planeAngle = 0;
        
        // Размеры оригинальной карты в пикселях
        this.mapPixelWidth = 3248;
        this.mapPixelHeight = 4096;
        
        // Размеры карты в Three.js
        this.mapWidth = 400;  // ширина в единицах Three.js
        this.mapHeight = 504; // высота в единицах Three.js
        
        this.init();
    }

    async init() {
        await this.loadBuildingsData();
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupControls();
        this.setupLighting();
        this.createGround();
        this.createLabelDiv();
        this.setupEventListeners();
        this.addRouteBuildings('historical'); // Загружаем начальный маршрут
        this.loadTrain(); // Загружаем поезд
        this.loadPlane(); // Загружаем самолет
        this.animate();
        this.hideLoading();
    }

    async loadBuildingsData() {
        try {
            console.log('Загружаем данные о зданиях...');
            const response = await fetch('buildings.json');
            if (response.ok) {
                this.buildingsData = await response.json();
                console.log('Данные загружены:', this.buildingsData);
            } else {
                throw new Error('Не удалось загрузить buildings.json');
            }
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            alert('Ошибка загрузки данных о зданиях. Убедитесь, что buildings.json находится в той же папке.');
        }
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            10000
        );
        this.camera.position.set(0, 100, 150);
        this.camera.lookAt(0, 0, 0);
    }

    setupRenderer() {
        const container = document.getElementById('map3d');
        if (!container) {
            console.error('Контейнер #map3d не найден в DOM!');
            return;
        }
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        
        console.log('Renderer создан успешно');
    }

    setupControls() {
        if (!this.renderer || !this.renderer.domElement) {
            console.error('Невозможно создать контролы: renderer не инициализирован');
            return;
        }
        
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 30;
        this.controls.maxDistance = 5000000000;
        this.controls.maxPolarAngle = Math.PI / 2.2;
        this.controls.target.set(0, 0, 0);
        
        console.log('Контролы созданы успешно');
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
        mainLight.position.set(100, 150, 50);
        this.scene.add(mainLight);
        
        const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
        topLight.position.set(0, 200, 0);
        this.scene.add(topLight);
    }

    createGround() {
        const geometry = new THREE.PlaneGeometry(
            this.mapWidth * 2,
            this.mapHeight * 2,
            1, 
            1
        );
        
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('ekb.png', () => {
            console.log('Текстура карты загружена с пропорциями 3248x4096');
        }, undefined, (error) => {
            console.error('Ошибка загрузки текстуры:', error);
        });
        
        const material = new THREE.MeshBasicMaterial({ 
            map: texture,
            side: THREE.DoubleSide
        });
        
        const ground = new THREE.Mesh(geometry, material);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        this.scene.add(ground);
        
        console.log(`Карта создана: ширина=${this.mapWidth * 2}, высота=${this.mapHeight * 2}`);
    }

    pixelsToThree(pixelX, pixelY) {
        const centerX = this.mapPixelWidth / 2;
        const centerY = this.mapPixelHeight / 2;
        
        const scaleX = (this.mapWidth * 2) / this.mapPixelWidth;
        const scaleZ = (this.mapHeight * 2) / this.mapPixelHeight;
        
        const x = (pixelX - centerX) * scaleX;
        const z = (pixelY - centerY) * scaleZ;
        
        return { x, z };
    }

    createBuilding(buildingData, routeName) {
        console.log(`Создаем: ${buildingData.name} (${routeName})`);
        
        const buildingGroup = new THREE.Group();
        
        // Если есть поле model - загружаем 3D модель
        if (buildingData.model) {
            this.loadGLBModel(buildingData.model, buildingGroup, buildingData, routeName);
        } else {
            // Создаем обычный куб
            const geometry = new THREE.BoxGeometry(
                buildingData.width,
                buildingData.height,
                buildingData.depth
            );
            
            const material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveIntensity: 0.3,
                roughness: 0.3,
                metalness: 0.6,
                transparent: false,
                opacity: 1.0
            });
            
            const building = new THREE.Mesh(geometry, material);
            building.castShadow = false;
            building.receiveShadow = false;
            
            const edges = new THREE.EdgesGeometry(geometry);
            const lineMaterial = new THREE.LineBasicMaterial({ 
                color: 0x000000, 
                linewidth: 3
            });
            const wireframe = new THREE.LineSegments(edges, lineMaterial);
            building.add(wireframe);
            
            buildingGroup.add(building);
        }
        
        const coords = this.pixelsToThree(buildingData.pixelX, buildingData.pixelY);
        buildingGroup.position.set(
            coords.x,
            buildingData.height / 2,
            coords.z
        );
        
        buildingGroup.rotation.set(0, 0, 0);
        
        buildingGroup.userData = {
            ...buildingData,
            route: routeName, // Помечаем к какому маршруту относится
            originalColor: 0x808080,
            originalEmissive: 0x404040
        };
        
        this.createClickableLabel(buildingData, coords.x, buildingData.height, coords.z, routeName);
        
        return buildingGroup;
    }

    loadGLBModel(modelPath, buildingGroup, buildingData, routeName) {
        const loader = new THREE.GLTFLoader();
        
        loader.load(
            modelPath,
            (gltf) => {
                const model = gltf.scene;
                
                // Применяем черно-белый фильтр
                this.applyGrayscale(model);
                
                // Масштабируем модель под нужный размер
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                
                const scaleX = buildingData.width / size.x;
                const scaleY = buildingData.height / size.y;
                const scaleZ = buildingData.depth / size.z;
                
                // Используем минимальный масштаб для сохранения пропорций
                const scale = Math.min(scaleX, scaleY, scaleZ);
                model.scale.set(scale, scale, scale);
                
                // Центрируем модель
                box.setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                model.position.sub(center);
                
                buildingGroup.add(model);
                console.log(`3D модель загружена: ${modelPath}`);
            },
            (xhr) => {
                console.log(`Загрузка ${modelPath}: ${(xhr.loaded / xhr.total * 100)}%`);
            },
            (error) => {
                console.error(`Ошибка загрузки модели ${modelPath}:`, error);
                // Если модель не загрузилась, создаем куб как fallback
                const geometry = new THREE.BoxGeometry(
                    buildingData.width,
                    buildingData.height,
                    buildingData.depth
                );
                const material = new THREE.MeshStandardMaterial({
                    color: 0xff0000,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.3
                });
                const cube = new THREE.Mesh(geometry, material);
                buildingGroup.add(cube);
            }
        );
    }

    applyGrayscale(object) {
        object.traverse((child) => {
            if (child.isMesh) {
                // Создаем новый серый материал для каждого меша
                const grayMaterial = new THREE.MeshStandardMaterial({
                    color: 0x808080,
                    roughness: 0.7,
                    metalness: 0.3
                });
                
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(() => grayMaterial.clone());
                } else {
                    child.material = grayMaterial;
                }
            }
        });
    }

    loadTrain() {
        const loader = new THREE.GLTFLoader();
        const coords = this.pixelsToThree(1565, 1026);
        
        loader.load(
            'TRAIN.glb',
            (gltf) => {
                this.train = gltf.scene;
                this.applyGrayscale(this.train);
                
                this.train.position.set(coords.x, 5, coords.z);
                this.train.scale.set(10, 10, 10);
                
                this.scene.add(this.train);
                console.log('Поезд загружен');
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки поезда:', error);
            }
        );
    }

    loadPlane() {
        const loader = new THREE.GLTFLoader();
        
        loader.load(
            'PLANE.glb',
            (gltf) => {
                this.plane = gltf.scene;
                this.applyGrayscale(this.plane);
                
                this.plane.scale.set(5, 5, 5);
                this.scene.add(this.plane);
                console.log('Самолет загружен');
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки самолета:', error);
            }
        );
    }


    createClickableLabel(buildingData, x, y, z, routeName) {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'building-label';
        labelDiv.textContent = buildingData.name;
        labelDiv.style.position = 'fixed';
        labelDiv.style.color = '#fff';
        labelDiv.style.background = 'rgba(0, 0, 0, 0.8)';
        labelDiv.style.padding = '5px 10px';
        labelDiv.style.borderRadius = '5px';
        labelDiv.style.fontSize = '12px';
        labelDiv.style.cursor = 'pointer';
        labelDiv.style.zIndex = '1000';
        labelDiv.style.pointerEvents = 'auto';
        labelDiv.style.border = '1px solid rgba(255, 255, 255, 0.3)';
        labelDiv.style.transition = 'all 0.2s ease';
        labelDiv.style.whiteSpace = 'nowrap';
        
        labelDiv.addEventListener('click', () => {
            const query = encodeURIComponent(buildingData.name + ' ' + buildingData.address);
            window.open(`https://yandex.ru/maps/?text=${query}`, '_blank');
        });
        
        labelDiv.addEventListener('mouseenter', () => {
            labelDiv.style.background = 'rgba(255, 255, 255, 0.9)';
            labelDiv.style.color = '#000';
        });
        
        labelDiv.addEventListener('mouseleave', () => {
            labelDiv.style.background = 'rgba(0, 0, 0, 0.8)';
            labelDiv.style.color = '#fff';
        });
        
        document.body.appendChild(labelDiv);
        this.labels.push({ 
            div: labelDiv, 
            position: new THREE.Vector3(x, y + 5, z),
            route: routeName
        });
    }

    updateLabelsPosition() {
        this.labels.forEach(label => {
            const screenPos = label.position.clone();
            screenPos.project(this.camera);
            
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (screenPos.y * -0.5 + 0.5) * window.innerHeight;
            
            label.div.style.left = x + 'px';
            label.div.style.top = y + 'px';
            
            if (screenPos.z > 1) {
                label.div.style.display = 'none';
            } else {
                label.div.style.display = 'block';
            }
        });
    }

    createLabelDiv() {
        this.labelDiv = document.createElement('div');
        this.labelDiv.style.position = 'fixed';
        this.labelDiv.style.background = 'rgba(255, 255, 255, 0.98)';
        this.labelDiv.style.color = '#000';
        this.labelDiv.style.padding = '15px 20px';
        this.labelDiv.style.border = '2px solid #000';
        this.labelDiv.style.pointerEvents = 'none';
        this.labelDiv.style.display = 'none';
        this.labelDiv.style.zIndex = '10000';
        this.labelDiv.style.fontSize = '18px';
        this.labelDiv.style.fontWeight = 'bold';
        this.labelDiv.style.maxWidth = '300px';
        this.labelDiv.style.textAlign = 'center';
        this.labelDiv.style.textTransform = 'uppercase';
        this.labelDiv.style.letterSpacing = '1px';
        this.labelDiv.style.borderRadius = '8px';
        document.body.appendChild(this.labelDiv);
    }

    addRouteBuildings(routeName) {
        if (!this.buildingsData || !this.buildingsData[routeName]) {
            console.error(`Маршрут ${routeName} не найден`);
            return;
        }

        const routeData = this.buildingsData[routeName];
        console.log(`Добавляем маршрут: ${routeData.name}`);

        routeData.buildings.forEach((buildingData, index) => {
            setTimeout(() => {
                const building = this.createBuilding(buildingData, routeName);
                this.scene.add(building);
                this.buildings.push(building);
                this.animateBuildingAppearance(building);
            }, index * 150);
        });
    }

    removeRouteBuildings(routeName) {
        console.log(`Удаляем маршрут: ${routeName}`);
        
        // Удаляем здания
        this.buildings = this.buildings.filter(building => {
            if (building.userData.route === routeName) {
                this.scene.remove(building);
                return false;
            }
            return true;
        });
        
        // Удаляем метки
        this.labels = this.labels.filter(label => {
            if (label.route === routeName) {
                if (label.div && label.div.parentNode) {
                    label.div.parentNode.removeChild(label.div);
                }
                return false;
            }
            return true;
        });
    }

    toggleRoute(routeName) {
        console.log(`Переключение маршрута: ${routeName}`);
        
        const btn = document.querySelector(`[data-route="${routeName}"]`);
        
        if (this.activeRoutes.includes(routeName)) {
            // Выключаем маршрут
            this.activeRoutes = this.activeRoutes.filter(r => r !== routeName);
            btn.classList.remove('active');
            this.removeRouteBuildings(routeName);
        } else {
            // Включаем маршрут
            this.activeRoutes.push(routeName);
            btn.classList.add('active');
            this.addRouteBuildings(routeName);
        }
        
        console.log('Активные маршруты:', this.activeRoutes);
    }

    animateBuildingAppearance(building) {
        const originalY = building.position.y;
        building.position.y = -50;
        building.scale.set(0.1, 0.1, 0.1);
        
        const startTime = Date.now();
        const duration = 1000;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeOutBounce = (t) => {
                if (t < 1 / 2.75) {
                    return 7.5625 * t * t;
                } else if (t < 2 / 2.75) {
                    return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
                } else if (t < 2.5 / 2.75) {
                    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
                } else {
                    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
                }
            };
            
            const easedProgress = easeOutBounce(progress);
            building.position.y = -50 + (originalY + 50) * easedProgress;
            building.scale.setScalar(0.1 + 0.9 * easedProgress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    setupEventListeners() {
        // Переключение маршрутов
        document.querySelectorAll('.route-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const route = e.target.dataset.route;
                this.toggleRoute(route);
            });
        });

        // Обработка пригласительного кода
        const inviteInput = document.getElementById('inviteCode');
        const partyBtn = document.getElementById('partyRouteBtn');
        
        if (inviteInput && partyBtn) {
            // Проверяем, был ли уже введен правильный код
            if (localStorage.getItem('inviteAccepted') === 'true') {
                partyBtn.classList.remove('hidden');
                inviteInput.style.borderColor = 'rgba(0, 255, 0, 0.6)';
                inviteInput.style.background = 'rgba(0, 255, 0, 0.1)';
            }

            inviteInput.addEventListener('input', (e) => {
                const code = e.target.value.toLowerCase().trim();
                if (code === 'eimun13bonuska') {
                    // Сохраняем факт успешного ввода
                    localStorage.setItem('inviteAccepted', 'true');
                    partyBtn.classList.remove('hidden');
                    inviteInput.style.borderColor = 'rgba(0, 255, 0, 0.6)';
                    inviteInput.style.background = 'rgba(0, 255, 0, 0.1)';
                } else {
                    // Не скрываем кнопку если код уже был принят ранее
                    if (localStorage.getItem('inviteAccepted') !== 'true') {
                        partyBtn.classList.add('hidden');
                        inviteInput.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        inviteInput.style.background = 'rgba(255, 255, 255, 0.1)';
                    }
                }
            });
        }

        // Обработка мыши для интерактивности
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.addEventListener('mousemove', (event) => {
                this.onMouseMove(event);
            });
        } else {
            console.error('Renderer domElement не найден!');
        }

        // Обработка изменения размера окна
        window.addEventListener('resize', () => {
            this.onWindowResize();
        });
    }

    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.buildings, true);

        if (this.hoveredBuilding) {
            this.hoveredBuilding.children[0].material.emissiveIntensity = 0.3;
        }

        if (intersects.length > 0) {
            let parent = intersects[0].object;
            while (parent.parent && !parent.userData.name) {
                parent = parent.parent;
            }

            if (parent.userData && parent.userData.name) {
                this.hoveredBuilding = parent;
                parent.children[0].material.emissiveIntensity = 0.6;
                
                document.body.style.cursor = 'pointer';
            }
        } else {
            this.labelDiv.style.display = 'none';
            this.hoveredBuilding = null;
            document.body.style.cursor = 'default';
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        // Анимация поезда - вращение на месте
        if (this.train) {
            this.train.rotation.y += 0.01;
        }
        
        // Анимация самолета - полет по кругу
        if (this.plane) {
            this.planeAngle -= 0.005;
            const radius = 250;
            const x = Math.cos(this.planeAngle) * radius;
            const z = Math.sin(this.planeAngle) * radius;
            
            // Следующая точка на траектории для определения направления
            const nextAngle = this.planeAngle - 0.01;
            const nextX = Math.cos(nextAngle) * radius;
            const nextZ = Math.sin(nextAngle) * radius;
            
            this.plane.position.set(x, 100, z);
            
            // Направляем самолет на следующую точку траектории
            this.plane.lookAt(nextX, 100, nextZ);
        }
        
        this.updateLabelsPosition();
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.labelDiv) {
            document.body.removeChild(this.labelDiv);
        }
        this.renderer.dispose();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    window.map3d = new Map3D();
});