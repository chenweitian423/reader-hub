from typing import Optional


DEMO_LIBRARY = {
    "books": [
        {
            "id": "moon-archive",
            "title": "月海档案",
            "author": "林见川",
            "cover": "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=640&q=80",
            "intro": "一名旧书修复师在海边小城收到一份来自月球基地的失落档案，由此卷入横跨百年的记忆谜局。",
            "status": "连载中",
            "latest_chapter": "第4章 回声图书馆",
            "chapters": [
                {
                    "id": "c1",
                    "title": "第1章 海风里的目录卡",
                    "content": "\n".join(
                        [
                            "临港旧街的书修铺总是在傍晚才真正醒来。",
                            "沈砚把最后一册残页装回纸匣时，门口那只铜铃轻轻晃了一下，没有人进门，只有一张沾着盐粒的目录卡被风吹到脚边。",
                            "卡片上写着一串陌生的馆藏编号，落款却来自一座早已废弃的月球图书馆。",
                            "他本该把这种恶作剧丢进废纸篓，可卡片背面那枚蜡封，和父亲失踪前留下的图章一模一样。",
                            "于是那天夜里，他第一次翻出了尘封十年的望远镜，也第一次意识到，自己修补的也许不只是一本书。 ",
                        ]
                    ),
                },
                {
                    "id": "c2",
                    "title": "第2章 失效借阅证",
                    "content": "\n".join(
                        [
                            "第二天清晨，卡片把他带到了港口仓库区最里面的一间旧档案室。",
                            "墙上钉着的借阅制度早已褪色，可抽屉里整整齐齐码着数百张失效借阅证，每一张都记录着并不存在于地球公共目录里的书名。",
                            "沈砚在最底层找到一张属于父亲的借阅证，归还日期停在十七年前的同一夜。",
                            "与此同时，档案室深处的老式播音机突然自行启动，只重复一句话：请在潮汐抵达前，归还记忆。 ",
                        ]
                    ),
                },
                {
                    "id": "c3",
                    "title": "第3章 潮汐电报",
                    "content": "\n".join(
                        [
                            "城里的信号塔在暴雨中断断续续，唯独那台播音机能稳定收发来自外海的电报码。",
                            "沈砚和气象站实习生周禾一起破译了第一段信息，发现所谓月球图书馆并未废弃，而是在以另一种方式继续借阅人类的记忆样本。",
                            "每借出一本书，就会有人忘掉与之对应的一段过去。",
                            "而父亲当年借走的，是一本记载全城起源的孤本。",
                        ]
                    ),
                },
                {
                    "id": "c4",
                    "title": "第4章 回声图书馆",
                    "content": "\n".join(
                        [
                            "潮水退去的夜里，港口最深处露出一座被封存的地下站台。",
                            "站台尽头没有列车，只有一扇会随着人心跳频率开启的门。",
                            "门后陈列着一排排发光书脊，每一本书都在轻声复述被借走的人生。",
                            "沈砚终于听见父亲的声音，从第七列第三层的空位上缓慢传来：如果你能读到这里，就说明这座城还没有彻底忘记自己。",
                        ]
                    ),
                },
            ],
        },
        {
            "id": "star-river",
            "title": "星河便利店",
            "author": "周栖白",
            "cover": "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=640&q=80",
            "intro": "一家只在凌晨两点营业的便利店，专门出售来自平行世界的遗失物。",
            "status": "已完结",
            "latest_chapter": "第3章 收银台尽头",
            "chapters": [
                {
                    "id": "c1",
                    "title": "第1章 两点零七分",
                    "content": "\n".join(
                        [
                            "许愿是在失业后的第三周，看见那家便利店的。",
                            "整条巷子都熄了灯，只有店门口的招牌在凌晨两点零七分准时亮起，像有人把一小段银河折进了玻璃灯箱里。",
                            "货架上没有零食，取而代之的是写着“未寄出的道歉”“差一点实现的夏天”“丢失的勇气”之类的标签。",
                        ]
                    ),
                },
                {
                    "id": "c2",
                    "title": "第2章 退货规则",
                    "content": "\n".join(
                        [
                            "店长说，这里卖的东西一旦拆封，就会从另一个世界失去对应的结局。",
                            "许愿买下了一枚标着“重来一次”的硬币，却在回家路上发现自己的旧日记正在一页页变空。",
                            "她终于明白，这家店的每一笔交易，都是在不同人生之间偷偷改写收据。",
                        ]
                    ),
                },
                {
                    "id": "c3",
                    "title": "第3章 收银台尽头",
                    "content": "\n".join(
                        [
                            "第三次踏进便利店时，收银台后面多了一面不会映出自己模样的镜子。",
                            "镜中站着的是另一个世界的她，神情平静，手里握着那份她曾经没敢递出的辞职信。",
                            "店长把找零轻轻推来，说真正能带走的从来不是商品，而是承认遗憾之后仍然继续生活的勇气。",
                        ]
                    ),
                },
            ],
        },
    ]
}


def search_demo_books(keyword: str) -> list[dict]:
    query = keyword.strip().lower()
    if not query:
        return []

    results = []
    for book in DEMO_LIBRARY["books"]:
        haystacks = [book["title"], book["author"], book["intro"]]
        if any(query in value.lower() for value in haystacks):
            results.append(
                {
                    "id": book["id"],
                    "title": book["title"],
                    "author": book["author"],
                    "cover": book["cover"],
                    "intro": book["intro"],
                    "status": book["status"],
                    "latest_chapter": book["latest_chapter"],
                    "detail_url": f"http://127.0.0.1:8000/demo-api/books/{book['id']}",
                }
            )
    return results


def get_demo_book(book_id: str) -> Optional[dict]:
    for book in DEMO_LIBRARY["books"]:
        if book["id"] == book_id:
            return book
    return None


def demo_library_stats() -> dict:
    books = DEMO_LIBRARY["books"]
    return {
        "book_count": len(books),
        "chapter_count": sum(len(book["chapters"]) for book in books),
    }
